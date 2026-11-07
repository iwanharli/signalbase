// Sends a batch of items to the configured AI provider and returns one category per item.
// Claude goes through the official Anthropic SDK; other providers through their OpenAI-compatible
// chat completions endpoint.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { NO_CATEGORY, type Category, type ProviderKind } from "@/lib/ai/classifier";
import { decryptSecret } from "../secrets";

export type ProviderConfig = { kind: ProviderKind; baseUrl: string | null; model: string; apiKeyEnc: string };
export type ClassifyItem = { id: string; text: string };
export type ClassifyResult = { id: string; category: string; confidence: number | null; reason: string | null };
/** Tokens one request used, as the provider reports them. */
export type TokenCount = { input: number; output: number };

/** Longest text sent per item; posts are short, news previews rarely exceed this. */
const MAX_ITEM_CHARS = 1500;

// Models that accept the server-side refusal fallback (see the Claude API docs on refusals).
const FALLBACK_MODELS = /^claude-(fable-5-1|opus-5-5|opus-5|sonnet-5-5)$/;

const resultSchema = z.object({
  results: z.array(z.object({ id: z.string(), category: z.string(), confidence: z.number().nullable().optional(), reason: z.string().nullable().optional() })),
});

function systemPrompt(prompt: string, categories: Category[]) {
  const list = categories.map((c) => `- ${c.code}: ${c.label}${c.description ? ` — ${c.description}` : ""}`).join("\n");
  return [
    prompt.trim(),
    "",
    "Kategori yang tersedia:",
    list,
    `- ${NO_CATEGORY}: tidak termasuk kategori mana pun`,
    "",
    "Untuk setiap item, kembalikan tepat satu kode kategori dari daftar di atas, tingkat keyakinan 0 sampai 1, dan alasan singkat (maksimal 20 kata, bahasa Indonesia).",
    "Kembalikan JSON dengan bentuk {\"results\": [{\"id\", \"category\", \"confidence\", \"reason\"}]} untuk semua item, memakai id yang sama.",
  ].join("\n");
}

const userMessage = (items: ClassifyItem[]) =>
  JSON.stringify({ items: items.map((i) => ({ id: i.id, text: i.text.slice(0, MAX_ITEM_CHARS) })) });

function jsonSchema(codes: string[]) {
  return {
    type: "object",
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            category: { type: "string", enum: [...codes, NO_CATEGORY] },
            confidence: { type: "number" },
            reason: { type: "string" },
          },
          required: ["id", "category", "confidence", "reason"],
          additionalProperties: false,
        },
      },
    },
    required: ["results"],
    additionalProperties: false,
  };
}

/** Keeps only results for requested ids with a known category; anything else becomes "none". */
function normalise(raw: unknown, items: ClassifyItem[], codes: string[]): ClassifyResult[] {
  const parsed = resultSchema.parse(raw);
  const known = new Map(codes.map((c) => [c.toUpperCase(), c]));
  const byId = new Map(parsed.results.map((r) => [r.id, r]));
  return items.flatMap((item) => {
    const r = byId.get(item.id);
    if (!r) return [];
    const confidence = typeof r.confidence === "number" ? Math.min(1, Math.max(0, r.confidence)) : null;
    return [{ id: item.id, category: known.get(r.category.toUpperCase()) ?? NO_CATEGORY, confidence, reason: r.reason?.slice(0, 300) || null }];
  });
}

async function classifyWithClaude(config: ProviderConfig, apiKey: string, system: string, items: ClassifyItem[], codes: string[], onUsage?: (u: TokenCount) => void) {
  const client = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 2 });
  const fallback = FALLBACK_MODELS.test(config.model);
  const response = await client.beta.messages.create({
    model: config.model,
    max_tokens: 8000,
    // Classification doesn't need deep reasoning; low effort keeps cost and latency down.
    output_config: { effort: "low", format: { type: "json_schema", schema: jsonSchema(codes) } },
    // The instructions are identical for every batch, so cache them.
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userMessage(items) }],
    ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
  });
  const u = response.usage;
  onUsage?.({ input: (u?.input_tokens ?? 0) + (u?.cache_read_input_tokens ?? 0) + (u?.cache_creation_input_tokens ?? 0), output: u?.output_tokens ?? 0 });
  if (response.stop_reason === "refusal") throw new Error("Model menolak memproses batch ini");
  if (response.stop_reason === "max_tokens") throw new Error("Jawaban model terpotong (max_tokens)");
  const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
  return JSON.parse(text);
}

async function classifyWithOpenAiCompatible(config: ProviderConfig, apiKey: string, system: string, items: ClassifyItem[], onUsage?: (u: TokenCount) => void) {
  if (!config.baseUrl) throw new Error("Base URL penyedia belum diatur");
  const res = await fetch(`${config.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: config.model,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: userMessage(items) }],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Penyedia AI menolak (${res.status}): ${body?.error?.message ?? res.statusText}`);
  if (body?.usage) onUsage?.({ input: Number(body.usage.prompt_tokens) || 0, output: Number(body.usage.completion_tokens) || 0 });
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Respons penyedia AI tidak berisi teks");
  return JSON.parse(content);
}

/** One category per item (items the model skipped are left out, so they are retried later). */
export async function classifyBatch(config: ProviderConfig, prompt: string, categories: Category[], items: ClassifyItem[], onUsage?: (u: TokenCount) => void): Promise<ClassifyResult[]> {
  if (!items.length) return [];
  const apiKey = decryptSecret(config.apiKeyEnc);
  const codes = categories.map((c) => c.code);
  const system = systemPrompt(prompt, categories);
  const raw = config.kind === "anthropic"
    ? await classifyWithClaude(config, apiKey, system, items, codes, onUsage)
    : await classifyWithOpenAiCompatible(config, apiKey, system, items, onUsage);
  return normalise(raw, items, codes);
}

/** Readable message for a provider error, without leaking request details. */
export function providerErrorMessage(error: unknown) {
  if (error instanceof Anthropic.AuthenticationError) return "API key Claude tidak valid";
  if (error instanceof Anthropic.PermissionDeniedError) return "API key Claude tidak punya akses ke model ini";
  if (error instanceof Anthropic.NotFoundError) return "Model tidak ditemukan";
  if (error instanceof Anthropic.RateLimitError) return "Batas pemakaian Claude tercapai, dicoba lagi nanti";
  if (error instanceof Anthropic.APIError) return `Claude API error ${error.status}`;
  if (error instanceof SyntaxError) return "Jawaban model bukan JSON yang valid";
  return error instanceof Error ? error.message.slice(0, 300) : "Kesalahan tidak diketahui";
}
