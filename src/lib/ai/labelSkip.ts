// Posts the label AI does not need to read: they get no AI call but are recorded as checked ("Sudah dicek AI", the ✓ on
// the card), and copies of a post already checked take its result. Measured on 13,137 checked SLOG POLRI posts
// (27 Nov 2026): short posts and calm posts lose about 1% of labels each; copies lose none (their result is copied).
import { createHash } from "node:crypto";
import type { MediaItem } from "@/lib/media/types";

export type SkipReason = "pendek" | "tidak-relevan" | "netral";
/** Why a post was passed over, as the card's ✓ explains it. */
export const SKIP_NOTE: Record<SkipReason, string> = {
  pendek: "hanya tag akun atau teks sangat pendek",
  "tidak-relevan": "ditandai tidak relevan",
  netral: "nada netral dengan intensitas rendah",
};
/** The model name stored for a passed-over post ("aturan:pendek"), and for a copy ("salinan"). */
export const RULE_MODEL = (reason: SkipReason) => `aturan:${reason}`;
export const COPY_MODEL = "salinan";

const MIN_WORDS = 5;
const CALM = new Set(["netral", "senang", "puas", "mendukung"]);
const MAX_CALM_LEVEL = 2;
/** Shorter normalised texts are too generic to treat as the same post. */
const MIN_KEY_CHARS = 30;

// X replies start with "Replying to @a @b": that line names accounts, it says nothing.
const strip = (text: string) => text.replace(/^\s*replying to\b/i, " ").replace(/https?:\/\/\S+/g, " ").replace(/(^|\s)[@#][\p{L}\p{N}_.]+/gu, " ");

/** Words that carry meaning: links, @accounts and #tags left out ("Replying to @a @b" has none). */
export const meaningfulWords = (text: string) => strip(text).replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 1).length;

/** Whether the label AI can pass this post over, and why. `text`: everything it would read (caption and image text). */
export function skipReason(item: Pick<MediaItem, "mood" | "moodLevel" | "analysis">, text: string): SkipReason | null {
  if (meaningfulWords(text) < MIN_WORDS) return "pendek";
  if (item.analysis?.relevance === "exclude") return "tidak-relevan";
  if (CALM.has((item.mood ?? "").toLowerCase()) && (item.moodLevel ?? 0) <= MAX_CALM_LEVEL) return "netral";
  return null;
}

/** The same text whoever posted it (links, @accounts, case, punctuation and spacing ignored); null when too short. */
export function textKey(text: string): string | null {
  const normal = strip(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return normal.length < MIN_KEY_CHARS ? null : createHash("sha1").update(normal).digest("hex");
}
