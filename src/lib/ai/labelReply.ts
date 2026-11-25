// What the label worker asks for and accepts back. The reply is untrusted: anything off the agreed shape is rejected.
import { z } from "zod";

/** Labels scored below this are dropped. */
export const MIN_LABEL_SCORE = 40;
/** AI labels scored below this are shown as needing a person's check. */
export const REVIEW_LABEL_SCORE = 60;

export type AiLabel = { label: string; score: number; reason: string };

const replySchema = z.object({ results: z.array(z.unknown()) });
const resultSchema = z.object({
  id: z.string(),
  // Whole percentages only: a 0-1 scale (0.85) must not be read as 1%.
  labels: z.array(z.object({ label: z.string(), confidence: z.number().int().min(0).max(100), reason: z.string().trim().min(1) })),
});

/** Labels per requested item. An item is left out when the model skipped it or answered it wrongly (unknown label, score
 *  that is not a whole 0-100, no reason), so it can be asked again; an item with no fitting label has an empty list. */
export function parseLabelReply(raw: unknown, ids: string[], options: string[]) {
  const wanted = new Set(ids);
  const canonical = new Map(options.map((o) => [o.toLocaleLowerCase("id"), o]));
  const out = new Map<string, AiLabel[]>();
  for (const entry of replySchema.parse(raw).results) {
    const parsed = resultSchema.safeParse(entry);
    if (!parsed.success || !wanted.has(parsed.data.id) || out.has(parsed.data.id)) continue;
    const labels = new Map<string, AiLabel>();
    let valid = true;
    for (const l of parsed.data.labels) {
      const label = canonical.get(l.label.trim().toLocaleLowerCase("id"));
      if (!label) { valid = false; break; }
      if (l.confidence >= MIN_LABEL_SCORE && !labels.has(label)) labels.set(label, { label, score: l.confidence, reason: l.reason.slice(0, 300) });
    }
    if (valid) out.set(parsed.data.id, [...labels.values()]);
  }
  return out;
}

/** "pause": needs a person (key, balance, access, model). "wait": the provider's trouble, try later. "batch": something
 *  about these items or this reply, so the batch is split. */
export function labelErrorKind(message: string): "pause" | "wait" | "batch" {
  if (/\((401|402|403|404)\)|api key|Base URL|insufficient balance|model not (found|exist)|AUTH_SECRET|Format kredensial|unable to authenticate/i.test(message)) return "pause";
  if (/\((408|409|425|429|5\d\d)\)|timeout|timed out|aborted|fetch failed|ECONN|ENOTFOUND|EAI_AGAIN/i.test(message)) return "wait";
  return "batch";
}

const BACKOFF_MINUTES = [1, 2, 5, 15, 30];
export const backoffMs = (streak: number) => BACKOFF_MINUTES[Math.min(Math.max(streak, 1), BACKOFF_MINUTES.length) - 1] * 60_000;

/** Whether older history must be walked again: the start date now reaches further back than the finished walk did. */
export const reachesFurther = (walkedFrom: string | null, startFrom: string | null) =>
  walkedFrom !== null && (startFrom === null || startFrom < walkedFrom);

/** Most source links kept for one label. */
export const MAX_SOURCES = 3;
export type Source = { url: string; title: string };
export type CheckedLabel = AiLabel & { disputed: boolean; sources: Source[] };

/** A label a person should look at: unsure, contradicted by a source, or with nothing found to support it. */
export const needsReview = (l: { score: number; disputed: boolean; sources: Source[] }) =>
  l.score < REVIEW_LABEL_SCORE || l.disputed || !l.sources.length;

type Block = { type?: string; text?: string; content?: unknown; input?: { query?: unknown } };

/** Searches the provider charges for: only those that returned results. */
export const billableSearches = (content: unknown) => (Array.isArray(content) ? (content as Block[]) : [])
  .filter((b) => b?.type === "web_search_tool_result" && Array.isArray(b.content) && b.content.length > 0).length;

/**
 * The web search reply (Anthropic-compatible content blocks): what was searched, the pages the API itself returned, and
 * the model's closing text. Throws when no search actually ran, so nothing is stored as checked without one.
 */
export function readSearchReply(content: unknown) {
  const blocks = Array.isArray(content) ? (content as Block[]) : [];
  const queries: string[] = [], results = new Map<string, Source>();
  let searched = false, errorCode = "", text = "";
  for (const block of blocks) {
    if (block.type === "server_tool_use") {
      if (typeof block.input?.query === "string") queries.push(block.input.query);
    } else if (block.type === "web_search_tool_result") {
      text = ""; // only what follows the last search is the answer
      if (!Array.isArray(block.content)) { errorCode = String((block.content as { error_code?: unknown } | null)?.error_code ?? ""); continue; }
      searched = true;
      for (const r of block.content as { url?: unknown; title?: unknown }[]) {
        if (typeof r?.url !== "string" || !/^https?:\/\//i.test(r.url) || results.has(r.url)) continue;
        results.set(r.url, { url: r.url, title: (typeof r.title === "string" && r.title.trim() ? r.title.trim() : r.url).slice(0, 200) });
      }
    } else if (block.type === "text") text += block.text ?? "";
  }
  if (!searched) {
    // The status in brackets lets labelErrorKind treat the search service's trouble as "try later".
    const status = errorCode === "too_many_requests" ? " (429)" : errorCode === "unavailable" ? " (503)" : "";
    throw new Error(`Pencarian internet gagal${status}: ${errorCode || "AI tidak melakukan pencarian"}`);
  }
  return { queries, results, text };
}

const verdictSchema = z.object({
  labels: z.array(z.object({
    label: z.string(), confidence: z.number().int().min(0).max(100), reason: z.string().trim().min(1),
    disputed: z.boolean(), sources: z.array(z.string()),
  })),
});

/**
 * The checked verdict on the labels the first pass chose. Every one of them must be answered. A source is kept only when
 * its URL is one the search returned. A label scored below the minimum is dropped, unless a source disputes it: then a
 * person decides.
 */
export function parseVerdict(text: string, candidates: AiLabel[], results: Map<string, Source>): CheckedLabel[] {
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { throw new Error("Jawaban hasil pencarian bukan JSON yang valid"); }
  const parsed = verdictSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Jawaban hasil pencarian tidak sesuai format yang diminta");
  return candidates.flatMap((candidate) => {
    const v = parsed.data.labels.find((l) => l.label.trim().toLocaleLowerCase("id") === candidate.label.toLocaleLowerCase("id"));
    if (!v) throw new Error("Jawaban hasil pencarian tidak menilai semua label");
    if (v.confidence < MIN_LABEL_SCORE && !v.disputed) return [];
    const sources = [...new Set(v.sources)].flatMap((url) => results.get(url) ?? []).slice(0, MAX_SOURCES);
    return [{ label: candidate.label, score: v.confidence, reason: v.reason.slice(0, 300), disputed: v.disputed, sources }];
  });
}
