// What an API key is allowed to read. Set when the key is created and enforced on the server for
// every request, on top of the request's own filters — so a client can narrow it, never widen it.
import { z } from "zod";
import { MEDIA_TYPES, type MediaType } from "./types";

export const keyScopeSchema = z.object({
  /** Items must mention at least one keyword. Empty = no keyword restriction. */
  keywords: z.array(z.string().trim().toLowerCase().min(2).max(60)).max(30).default([]),
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

export type KeyScope = z.infer<typeof keyScopeSchema>;

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
