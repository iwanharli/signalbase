// Settings of AI labelling ("Kustomisasi Label"), shared by the panel and the server. One set per project.
import { z } from "zod";
import { apiKeyProblem, XAI_BASE_URL } from "./classifier";

/** The providers listed, the first one preselected. Both speak the OpenAI API; the address is fixed per provider, so the
 *  browser never chooses where a key is sent. Every AI label is checked by web search, so only a provider whose search is
 *  built (`webSearch`) can be saved. */
export const LABEL_AI_PROVIDERS = [
  { id: "deepseek", label: "DeepSeek", vendor: "DeepSeek", baseUrl: "https://api.deepseek.com", model: "deepseek-flash", webSearch: true },
  { id: "grok", label: "Grok (xAI)", vendor: "xAI", baseUrl: XAI_BASE_URL, model: "grok-4.7", webSearch: false },
] as const;
export type LabelAiProviderId = (typeof LABEL_AI_PROVIDERS)[number]["id"];
export const labelAiProvider = (id: string) => LABEL_AI_PROVIDERS.find((p) => p.id === id) ?? LABEL_AI_PROVIDERS[0];

const providerFields = {
  provider: z.enum(["deepseek", "grok"]),
  model: z.string().trim().min(2, "Model wajib diisi").max(100),
  /** Empty keeps (or tests) the stored key of the same provider. */
  apiKey: z.string().trim().max(400).default(""),
};
const keyLooksRight = (v: { provider: string; apiKey: string }) => !v.apiKey || !apiKeyProblem("openai_compatible", labelAiProvider(v.provider).baseUrl, v.apiKey);
const KEY_MESSAGE = { message: "API key penyedia AI tidak terlihat seperti API key", path: ["apiKey"] };

export const labelAiTestSchema = z.object(providerFields).refine(keyLooksRight, KEY_MESSAGE);
export const labelAiSchema = z.object({
  ...providerFields,
  /** null: not edited, so the instruction keeps following the project's labels. */
  prompt: z.string().trim().min(10, "Instruksi minimal 10 karakter").max(8000, "Instruksi maksimal 8000 karakter").nullable(),
  /** Oldest publish time to label; null = everything in scope. */
  startFrom: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Tanggal mulai tidak valid").nullable(),
  enabled: z.boolean().default(false),
}).refine(keyLooksRight, KEY_MESSAGE)
  .refine((v) => labelAiProvider(v.provider).webSearch, { message: "Penyedia ini belum bisa dipakai: pencarian sumbernya belum tersedia", path: ["provider"] });
export type LabelAiInput = z.infer<typeof labelAiSchema>;

/** Saved settings as the panel receives them: never the key itself. */
export type LabelAiSaved = { provider: LabelAiProviderId; model: string; apiKeyHint: string; prompt: string | null; startFrom: string | null; enabled: boolean; updatedBy: string; updatedAt: string };
/** What the label worker has done for the project. */
export type LabelAiProgress = { processed: number; failed: number; todayCount: number; lastError: string | null; lastRunAt: string | null; inputTokens: number; outputTokens: number };
export type LabelAiState = { saved: LabelAiSaved | null; progress?: LabelAiProgress | null };

const USAGE_HOUR = 3_600_000, USAGE_DAY = 24 * USAGE_HOUR;

/** The chart's stacked parts, bottom first. */
export const USAGE_PARTS = [
  { label: "Penyaringan", color: "#a78bfa" },
  { label: "Token cek sumber", color: "#22d3ee" },
  { label: "Biaya pencarian", color: "#fbbf24" },
] as const;
type Parts = [number, number, number];
export type UsageRow = {
  hour: Date; model: string; inputTokens: number; cachedTokens: number; outputTokens: number; calls: number;
  checkInputTokens: number; checkCachedTokens: number; checkOutputTokens: number; searches: number;
};

/** Labelling usage per bucket, split into USAGE_PARTS: estimated cost (`parts`) and tokens (`tokenParts`, none for the
 *  search fee). `price` returns the cost of each part of one row. Rows outside the range are ignored. */
export function usageSeries(rows: UsageRow[], from: Date, end: number, hourly: boolean, price: (row: UsageRow) => Parts) {
  const size = hourly ? USAGE_HOUR : USAGE_DAY;
  const out = Array.from({ length: Math.max(1, Math.round((end - from.getTime()) / size)) }, (_, i) => ({
    start: new Date(from.getTime() + i * size).toISOString(), spent: 0, input: 0, output: 0, calls: 0, searches: 0,
    parts: [0, 0, 0] as Parts, tokenParts: [0, 0, 0] as Parts,
  }));
  for (const row of rows) {
    const b = out[Math.floor((row.hour.getTime() - from.getTime()) / size)];
    if (!b) continue;
    price(row).forEach((v, i) => { b.parts[i] += v; b.spent += v; });
    const check = row.checkInputTokens + row.checkOutputTokens;
    b.tokenParts[0] += row.inputTokens + row.outputTokens - check; b.tokenParts[1] += check;
    b.input += row.inputTokens; b.output += row.outputTokens; b.calls += row.calls; b.searches += row.searches;
  }
  return out;
}
