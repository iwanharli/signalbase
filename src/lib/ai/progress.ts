// How far a project's AI categorisation is, per media type and overall, for the progress dock in the panel.
// Labelled items over the items in range, from the counts the project page stored (counting takes ~25 s, so the dock never
// counts itself). Without stored counts it falls back to time: the worker walks back from now to the start date, so the
// share of that span already behind its cursor is roughly the share done.
import type { MediaType } from "@/lib/media/types";

export type TypeCursor = { oldest?: { ts: string }; backfillDone?: boolean };
/** waiting: not started yet; backfill: walking back through history; live: history done, following new posts. */
export type ProgressState = "waiting" | "backfill" | "live";
export type TypeProgress = { type: MediaType; state: ProgressState; pct: number | null; reached: string | null; done: number };

/** Scope counts stored on a classifier by the estimate route, per range ("" = whole scope, else the start as ISO). */
export type StoredScopeCounts = { scope: string; ranges: Record<string, { social?: number | null; online?: number | null; at: number }> };
export function scopeCountsFor(stored: unknown, scopeKey: string, range: string) {
  const s = stored as StoredScopeCounts | null;
  return s?.scope === scopeKey && s.ranges ? s.ranges[range] ?? null : null;
}

/** Share done, as the panel shows it: whole percent rounded down, 100 only when nothing is left. */
export const sharePct = (done: number, total: number) => (total <= 0 ? 0 : done >= total ? 100 : Math.floor((done / total) * 100));

/** Source timestamps are wall-clock strings without a zone; the worker compares them as UTC, and so does this. */
const at = (ts: string) => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(ts) ? ts : `${ts}Z`).getTime();

export function typeProgress(input: {
  type: MediaType; cursor: TypeCursor | undefined; startFrom: Date | null; now: number; done: number; total: number | null;
}): TypeProgress {
  const { type, cursor, startFrom, now, done, total } = input;
  const reached = cursor?.oldest?.ts ?? null;
  if (cursor?.backfillDone) return { type, state: "live", pct: 100, reached, done };
  if (!reached) return { type, state: "waiting", pct: 0, reached, done };
  // Counted items when known (the same numbers the project page shows), else the share of the time span walked back.
  const pct = total ? (done / total) * 100
    : startFrom ? ((now - at(reached)) / Math.max(1, now - startFrom.getTime())) * 100 : null;
  // Never shows 100 while history is still being walked.
  return { type, state: "backfill", pct: pct === null ? null : Math.max(0, Math.min(99, Math.floor(pct))), reached, done };
}

/** Overall: done over total when every type has a count (as on the project page), else the mean of the types; and the
 *  least advanced state. */
export function overallProgress(types: TypeProgress[], totals?: (number | null)[]): { state: ProgressState; pct: number | null } {
  if (!types.length) return { state: "waiting", pct: null };
  const state: ProgressState = types.some((t) => t.state === "backfill") ? "backfill"
    : types.every((t) => t.state === "live") ? "live" : types.some((t) => t.state === "live") ? "backfill" : "waiting";
  const counted = totals && totals.length === types.length && totals.every((n) => n !== null);
  const pct = counted ? sharePct(types.reduce((s, t) => s + t.done, 0), totals.reduce((s, n) => s! + n!, 0)!)
    : types.some((t) => t.pct === null) ? null : Math.floor(types.reduce((s, t) => s + t.pct!, 0) / types.length);
  return { state, pct: state === "live" ? 100 : pct === null ? null : Math.min(99, pct) };
}
