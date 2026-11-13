// Shared (client + server) definitions for Ringkasan AI: the summary's shape and the admin settings form.
import { z } from "zod";
import { apiKeyProblem } from "./classifier";

export const TONES = ["positif", "netral", "negatif", "waspada"] as const;
export type Tone = (typeof TONES)[number];
export const IMPACTS = ["tinggi", "sedang", "rendah"] as const;
export type Impact = (typeof IMPACTS)[number];
export const TRENDS = ["baru", "naik", "stabil", "turun"] as const;
export type Trend = (typeof TRENDS)[number];

/** A value from a fixed list, case-insensitive, with a fallback for anything else the model writes. */
const oneOf = <T extends string>(list: readonly T[], fallback: T) =>
  z.string().transform((t): T => (list as readonly string[]).includes(t.trim().toLowerCase()) ? (t.trim().toLowerCase() as T) : fallback);
const tone = oneOf(TONES, "netral");
const text = (max: number) => z.string().trim().min(1).transform((s) => s.slice(0, max));
/** Codes of the input items a statement rests on (S3, B1, E2, I4); unknown codes are dropped on the server. */
const evidence = z.array(z.string()).default([]).transform((a) => [...new Set(a.map((x) => x.trim().toUpperCase()).filter((x) => /^[SBEI]\d{1,3}$/.test(x)))].slice(0, 4));

/** A source the summary cites, resolved from an input code. */
export type SourceRef = { id: string; label: string; url: string | null };

/** What the model returns, after validation. Lenient on enum values and lengths so one odd field never loses a day.
 *  Version 1 rows (before impact, trend, implication, evidence and confidence) still parse: the new fields are optional. */
export const summaryContentSchema = z.object({
  headline: text(220),
  overview: text(1800),
  sentiment: z.object({ tone, note: text(320) }),
  highlights: z.array(z.object({
    title: text(100),
    detail: text(500),
    /** v1: the only rating. v2: sentiment of the issue, next to its impact. */
    tone: tone.optional(),
    sentiment: tone.optional(),
    impact: oneOf(IMPACTS, "sedang").optional(),
    trend: oneOf(TRENDS, "stabil").optional(),
    implication: text(400).optional(),
    evidence,
  })).min(1).transform((a) => a.slice(0, 5)),
  watch: z.array(z.union([text(320), z.object({ text: text(320), evidence })]))
    .default([]).transform((a) => a.slice(0, 3).map((w) => (typeof w === "string" ? { text: w, evidence: [] as string[] } : w))),
  actions: z.array(z.union([text(320), z.object({ action: text(320), reason: text(320).optional() })]))
    .default([]).transform((a) => a.slice(0, 3).map((x) => (typeof x === "string" ? { action: x } : x))),
  confidence: z.object({ level: oneOf(IMPACTS, "sedang"), note: text(300) }).optional(),
  /** What the public itself says on social media, apart from outlets and institutions (v3). */
  publicConversation: z.object({
    summary: text(700),
    drivers: z.array(text(120)).default([]).transform((a) => a.slice(0, 4)),
    vsMedia: text(350).optional(),
    evidence,
  }).optional(),
  /** Filled by the server from the cited codes, never by the model. */
  sources: z.record(z.string(), z.object({ label: z.string(), url: z.string().nullable() })).default({}),
});
export type SummaryContent = z.infer<typeof summaryContentSchema>;

/** Removes input codes the model wrote into prose despite the prompt ("E3/E4", "berita B1", "(S2, S5)"); codes belong in evidence only. */
export function stripCodes(text: string) {
  return text
    .replace(/\s*\((?:[SBEI]\d{1,3}\s*[,/]?\s*)+\)/g, "")
    .replace(/\b(?:berita|post|isu|sampel)\s+[SBEI]\d{1,3}\b/gi, (m) => m.replace(/\s+[SBEI]\d{1,3}$/i, ""))
    .replace(/\b[SBEI]\d{1,3}(?:\s*[/,]\s*[SBEI]\d{1,3})*\b\s*/g, "")
    .replace(/\s+([,.;:])/g, "$1").replace(/\s{2,}/g, " ").trim();
}

/** Keeps only evidence codes that exist in the input, stores what each cited code points to, and strips codes from the prose. */
export function withSources(content: SummaryContent, refs: Map<string, Omit<SourceRef, "id">>): SummaryContent {
  const sources: SummaryContent["sources"] = {};
  const keep = (codes: string[]) => codes.filter((c) => {
    const ref = refs.get(c);
    if (ref) sources[c] = ref;
    return !!ref;
  });
  const clean = <T extends string | undefined>(t: T) => (t === undefined ? t : stripCodes(t)) as T;
  const pc = content.publicConversation;
  return {
    ...content,
    headline: clean(content.headline), overview: clean(content.overview),
    sentiment: { ...content.sentiment, note: clean(content.sentiment.note) },
    highlights: content.highlights.map((h) => ({ ...h, title: clean(h.title), detail: clean(h.detail), implication: clean(h.implication), evidence: keep(h.evidence) })),
    watch: content.watch.map((w) => ({ text: clean(w.text), evidence: keep(w.evidence) })),
    actions: content.actions.map((a) => ({ action: clean(a.action), reason: clean(a.reason) })),
    ...(content.confidence ? { confidence: { ...content.confidence, note: clean(content.confidence.note) } } : {}),
    ...(pc ? { publicConversation: { summary: clean(pc.summary), drivers: pc.drivers.map(clean), vsMedia: clean(pc.vsMedia), evidence: keep(pc.evidence) } } : {}),
    sources,
  };
}

/** One day's summary as the Ringkasan card sees it. */
export type SummaryView = {
  day: string; status: "ok" | "failed"; content: SummaryContent | null; error: string | null;
  model: string; updatedAt: string;
};
export type SummaryResponse = {
  summary: SummaryView | null;
  /** Data days with a summary for this scope, newest first (for paging back). */
  days: string[];
  /** The newest complete data day (yesterday) and the Jakarta hour its summary is written. */
  latest: string; hour: number;
  configured: boolean; enabled: boolean;
};

export const AI_SUMMARY_PROVIDERS = [
  { id: "deepseek", label: "DeepSeek", kind: "openai_compatible", baseUrl: "https://api.deepseek.com", model: "deepseek-flash" },
  { id: "claude", label: "Claude (Anthropic)", kind: "anthropic", baseUrl: "", model: "claude-haiku-5-5" },
  { id: "openai", label: "OpenAI", kind: "openai_compatible", baseUrl: "https://api.openai.com/v1", model: "" },
  { id: "custom", label: "Lainnya (kompatibel OpenAI)", kind: "openai_compatible", baseUrl: "", model: "" },
] as const;

const price = z.coerce.number().min(0, "Harga tidak boleh negatif").max(1000);

/** The AI settings form. An empty `apiKey` keeps the stored one. */
export const aiSettingInputSchema = z.object({
  provider: z.object({
    kind: z.enum(["anthropic", "openai_compatible"]),
    baseUrl: z.string().trim().url("Base URL tidak valid").max(300).or(z.literal("")).default(""),
    model: z.string().trim().min(2, "Model wajib diisi").max(100),
    apiKey: z.string().trim().max(400).default(""),
  }).refine((p) => p.kind !== "openai_compatible" || !!p.baseUrl, { message: "Base URL wajib diisi", path: ["baseUrl"] })
    .refine((p) => !p.apiKey || !apiKeyProblem(p.kind, p.baseUrl, p.apiKey), { message: "API key penyedia AI tidak terlihat seperti API key", path: ["apiKey"] }),
  summaryEnabled: z.boolean(),
  summaryHour: z.coerce.number().int().min(0).max(23),
  includeProjects: z.boolean(),
  monthlyBudget: z.coerce.number().min(0).max(100_000).nullable(),
  priceInput: price,
  priceCachedInput: price,
  priceOutput: price,
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Mata uang 3 huruf, misalnya USD"),
});
export type AiSettingInput = z.infer<typeof aiSettingInputSchema>;

/** The settings as the admin page sees them: the provider key itself is never returned. */
export type AiSettingView = Omit<AiSettingInput, "provider"> & {
  provider: { kind: "anthropic" | "openai_compatible"; baseUrl: string; model: string; apiKeyHint: string };
  updatedAt: string; updatedBy: string | null;
};

/** Estimated cost of one call from its tokens and the per-1M prices. */
export function callCost(u: { input: number; cached: number; output: number }, p: { priceInput: number; priceCachedInput: number; priceOutput: number }) {
  return ((u.input - u.cached) * p.priceInput + u.cached * p.priceCachedInput + u.output * p.priceOutput) / 1_000_000;
}

export type UsageRow = {
  id: number; at: string; purpose: string; scopeName: string | null; model: string;
  inputTokens: number; cachedTokens: number; outputTokens: number; cost: number; currency: string; ok: boolean; error: string | null; ms: number;
};
export type UsageResponse = {
  currency: string;
  month: { cost: number; calls: number; tokens: number; budget: number | null };
  /** Cost per Jakarta day, last 30 days, oldest first. */
  daily: { day: string; cost: number; calls: number }[];
  rows: UsageRow[];
  total: number;
  balance: { currency: string; total: number }[] | null;
};
