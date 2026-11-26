// What an API key is allowed to read. Set when the key is created and enforced on the server for
// every request, on top of the request's own filters — so a client can narrow it, never widen it.
import { z } from "zod";
import { keywordProblem } from "./keywordExpr";
import { MEDIA_TYPES, type MediaType } from "./types";

export const keyScopeSchema = z.object({
  /** Items must match at least one keyword: a word, a phrase, or an AND / OR expression (keywordExpr.ts). Empty = none. */
  keywords: z.array(z.string().trim().toLowerCase().min(2, "Kata kunci minimal 2 karakter").max(200, "Kata kunci maksimal 200 karakter")
    .superRefine((k, ctx) => { const problem = keywordProblem(k); if (problem) ctx.addIssue({ code: "custom", message: `Kata kunci "${k}": ${problem}` }); }))
    .max(30).default([]),
  /** Media types the key may read. Empty = both. */
  types: z.array(z.enum(MEDIA_TYPES)).default([]),
  /** Only items that already have an emotion/sentiment label. */
  analyzedOnly: z.boolean().default(false),
  /** AI relevance (social posts only). */
  relevance: z.enum(["", "relevant", "include", "watchlist"]).default(""),
  language: z.enum(["", "id", "other"]).default(""),
  /** BPS province codes. Empty = all of Indonesia. */
  provinces: z.array(z.string().regex(/^\d{1,4}$/)).max(40).default([]),
  /** Lower-case category names. Empty = all categories. */
  categories: z.array(z.string().trim().toLowerCase().min(1).max(60)).max(60).default([]),
  /** Minimum emotion intensity 1–5 (social posts only). 0 = any. */
  minLevel: z.number().int().min(0).max(5).default(0),
});

export type KeyScope = z.infer<typeof keyScopeSchema> & {
  /** Server only, never stored: items the project matches through the text in their images (media worker), which count
   *  as matching its keywords. Attached by withImageCodes (server/media/textSignals.ts). */
  imageCodes?: Partial<Record<MediaType, string[]>>;
  /** Server only: items whose image text matches the request's search (?q=), which count as matching it. */
  imageSearch?: Partial<Record<MediaType, string[]>>;
  /** Server only: a second keyword set items must also match (one of them), e.g. an SNA watch within a project. */
  alsoKeywords?: string[];
};

/** No restriction at all: used by the admin panel, which sees the whole bank. */
export const OPEN_SCOPE: KeyScope = keyScopeSchema.parse({});

/** Parses a stored scope, falling back to "no restriction" for any field that is missing or invalid. */
export function parseKeyScope(stored: unknown, keywords: string[] = []): KeyScope {
  const result = keyScopeSchema.safeParse({ ...(stored && typeof stored === "object" ? stored : {}), keywords });
  return result.success ? result.data : { ...OPEN_SCOPE, keywords };
}

export const allowsType = (scope: KeyScope, type: MediaType) => !scope.types.length || scope.types.includes(type);

/** True when the scope restricts something besides keywords. */
export const hasExtraRestrictions = (scope: KeyScope) =>
  !!(scope.types.length || scope.analyzedOnly || scope.relevance || scope.language || scope.provinces.length || scope.categories.length || scope.minLevel);

/**
 * What a scope change means for the key's stored AI labels:
 *  - "none":    nothing changed.
 *  - "keep":    only "analysed items only" was turned on; the key sees a subset, every label stays valid.
 *  - "extend":  keywords were only added (none removed) and/or "analysed items only" was turned off: every labelled
 *               post is still in the project, so labels stay and the posts that come in are labelled on top (the
 *               worker skips posts that already have a label, so nothing is paid twice).
 *  - "restart": anything else (a keyword removed, another restriction changed) drops posts that carry labels, so labels
 *               are wiped and categorisation starts over.
 */
export type LabelImpact = "none" | "keep" | "extend" | "restart";

export function labelImpact(next: KeyScope, prev: KeyScope): LabelImpact {
  const json = (s: KeyScope) => JSON.stringify(s);
  if (json(next) === json(prev)) return "none";
  const rest = (s: KeyScope) => json({ ...s, analyzedOnly: false, keywords: [] });
  if (rest(next) !== rest(prev)) return "restart";
  // Keywords are OR-ed, so adding one only lets posts in; removing one drops posts that may carry labels.
  if (!prev.keywords.every((k) => next.keywords.includes(k))) return "restart";
  // An empty list means no keyword restriction at all: adding the first keyword narrows the project.
  if (!prev.keywords.length && next.keywords.length) return "restart";
  const added = next.keywords.some((k) => !prev.keywords.includes(k));
  if (added) return "extend";
  return next.analyzedOnly ? "keep" : "extend";
}
