
// Plan limits enforced by the panel and API. Keep in line with what /pricing promises
// (src/components/pricing/plans.ts); null means no limit.

// Since 2026-11-26 Signalbase offers one plan, Instansi, sold by an admin after approving the sign-up: projects are set
// up by admins, so plans carry no limits. The types stay for the code that reads them.
export const PLAN_IDS = ["instansi"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export type PlanLimits = {
  /** Active API keys the account may hold. */
  keys: number | null;
  /** Keywords per key. */
  keywordsPerKey: number | null;
  /** How far back media can be read, in days. */
  historyDays: number | null;
  /** Public API calls per day. */
  callsPerDay: number | null;
  /** Posts Signalbase AI may label per calendar month (0 = no AI categorisation at all). */
  aiPostsPerMonth: number | null;
  /** May use their own AI provider key instead of Signalbase AI. */
  ownAiKey: boolean;
  /** Bank analysis included with each item: mood only, + summary/target/relevance, or everything. */
  analysis: "mood" | "content" | "full";
};

const NO_LIMITS: PlanLimits = { keys: null, keywordsPerKey: null, historyDays: null, callsPerDay: null, aiPostsPerMonth: null, ownAiKey: true, analysis: "full" };
export const PLAN_LIMITS: Record<PlanId, PlanLimits> = { instansi: NO_LIMITS };

export const PLAN_LABEL: Record<PlanId, string> = { instansi: "Instansi" };

export const isPlanId = (v: unknown): v is PlanId => typeof v === "string" && (PLAN_IDS as readonly string[]).includes(v);

/** No plan limits any more (see above). */
export function limitsFor(plan?: string | null): PlanLimits {
  void plan;
  return NO_LIMITS;
}

/** Today's date in Jakarta (YYYY-MM-DD), the day API usage is counted against. */
export const jakartaToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

/** Days left until `expiresAt`, counting a started day as a whole one (1 on the last day, 0 or less once passed);
 *  null when there is no end date. A fresh 7-day trial reads 7. */
export function daysLeft(expiresAt: Date | string | null | undefined, now = Date.now()) {
  if (!expiresAt) return null;
  return Math.ceil((new Date(expiresAt).getTime() - now) / 86_400_000);
}

export const isExpired = (expiresAt: Date | string | null | undefined, now = Date.now()) =>
  !!expiresAt && new Date(expiresAt).getTime() <= now;
