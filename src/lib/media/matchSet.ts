// A project's stored keyword matches (server/projectMatches.ts), as its source-database queries use them.
import type { MediaType } from "./types";

/** A project's stored matches of one media type: codes sorted by time, and the time each was posted (naive
 *  "YYYY-MM-DDTHH:MM:SS", as the source stores it). Every item at or after `coverFrom` (YYYY-MM-DD) is in it. */
export type MatchSet = { coverFrom: string; codes: string[]; at: string[] };
export type MatchSets = Partial<Record<MediaType, MatchSet>>;

/** Codes of a match set posted in [from, to] (YYYY-MM-DD, either open); `at` is sorted, so two binary searches. */
export function codesBetween(set: MatchSet, from: string | null, to: string | null) {
  const first = (pred: (at: string) => boolean) => {
    let lo = 0, hi = set.at.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (pred(set.at[mid])) hi = mid; else lo = mid + 1; }
    return lo;
  };
  const start = from ? first((at) => at >= from) : 0;
  const end = to ? first((at) => at.slice(0, 10) > to) : set.at.length;
  return set.codes.slice(start, Math.max(start, end));
}
