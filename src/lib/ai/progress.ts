// How far a project's AI categorisation is, per media type and overall, for the progress dock in the panel.
// Counting the items in a scope takes ~25 s, so progress is measured in time instead: the worker walks back from now to
// the start date, so the share of that span already behind its cursor is the share done (posts spread roughly evenly).
import type { MediaType } from "@/lib/media/types";

export type TypeCursor = { oldest?: { ts: string }; backfillDone?: boolean };
/** waiting: not started yet; backfill: walking back through history; live: history done, following new posts. */
export type ProgressState = "waiting" | "backfill" | "live";
export type TypeProgress = { type: MediaType; state: ProgressState; pct: number | null; reached: string | null; done: number };

/** Source timestamps are wall-clock strings without a zone; the worker compares them as UTC, and so does this. */
const at = (ts: string) => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(ts) ? ts : `${ts}Z`).getTime();

export function typeProgress(input: {
  type: MediaType; cursor: TypeCursor | undefined; startFrom: Date | null; now: number; done: number; total: number | null;
}): TypeProgress {
  const { type, cursor, startFrom, now, done, total } = input;
  const reached = cursor?.oldest?.ts ?? null;
  if (cursor?.backfillDone) return { type, state: "live", pct: 100, reached, done };
  if (!reached) return { type, state: "waiting", pct: 0, reached, done };
  // With a start date the span is known; without one, fall back to the stored scope count when there is one.
  const pct = startFrom
    ? ((now - at(reached)) / Math.max(1, now - startFrom.getTime())) * 100
    : total ? (done / total) * 100 : null;
  // Never shows 100 while history is still being walked.
  return { type, state: "backfill", pct: pct === null ? null : Math.max(0, Math.min(99, Math.floor(pct))), reached, done };
}

/** Overall: the mean of the media types (null when one of them cannot be measured), and the least advanced state. */
export function overallProgress(types: TypeProgress[]): { state: ProgressState; pct: number | null } {
  if (!types.length) return { state: "waiting", pct: null };
  const state: ProgressState = types.some((t) => t.state === "backfill") ? "backfill"
    : types.every((t) => t.state === "live") ? "live" : types.some((t) => t.state === "live") ? "backfill" : "waiting";
  const pct = types.some((t) => t.pct === null) ? null : Math.floor(types.reduce((s, t) => s + t.pct!, 0) / types.length);
  return { state, pct: state === "live" ? 100 : pct === null ? null : Math.min(99, pct) };
}
