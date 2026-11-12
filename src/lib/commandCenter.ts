// Pure helpers behind the Command Center charts (no React), so they can be tested.

/** Gauge fill for "now vs the usual": half full = as usual, full = twice the usual or more. */
export const ratioFill = (now: number, avg: number) => (avg > 0 ? Math.min(1, now / (2 * avg)) : now > 0 ? 1 : 0);

/** Percentage change from `before` to `now`; null when there is nothing to compare with. */
export const changePct = (now: number, before: number) => (before > 0 ? ((now - before) / before) * 100 : null);
