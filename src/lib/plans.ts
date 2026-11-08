// Plan limits enforced by the panel and API. Keep in line with what /pricing promises
// (src/components/pricing/plans.ts); null means no limit.

export const PLAN_IDS = ["trial", "starter", "pro", "instansi"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export type PlanLimits = {
  /** Active API keys the account may hold. */
  keys: number | null;
  /** Keywords per key. */
  keywordsPerKey: number | null;
  /** How far back media can be read, in days. */
  historyDays: number | null;
  /** Public API calls per day, shared by all of the account's keys. */
  callsPerDay: number | null;
  /** Posts Signalbase AI may label per calendar month (0 = no AI categorisation at all). */
  aiPostsPerMonth: number | null;
  /** May use their own AI provider key instead of Signalbase AI. */
  ownAiKey: boolean;
  /** Bank analysis included with each item: mood only, + summary/target/relevance, or everything. */
  analysis: "mood" | "content" | "full";
};

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  trial: { keys: 1, keywordsPerKey: 2, historyDays: 30, callsPerDay: 5_000, aiPostsPerMonth: 500, ownAiKey: false, analysis: "content" },
  starter: { keys: 2, keywordsPerKey: 3, historyDays: 30, callsPerDay: 10_000, aiPostsPerMonth: 0, ownAiKey: false, analysis: "mood" },
  pro: { keys: 5, keywordsPerKey: 7, historyDays: 365, callsPerDay: 100_000, aiPostsPerMonth: 20_000, ownAiKey: true, analysis: "content" },
  instansi: { keys: null, keywordsPerKey: 30, historyDays: null, callsPerDay: null, aiPostsPerMonth: null, ownAiKey: true, analysis: "full" },
};

export const PLAN_LABEL: Record<PlanId, string> = { trial: "Trial", starter: "Starter", pro: "Pro", instansi: "Instansi" };

/** Length of the trial that starts when an admin approves a sign-up. */
export const TRIAL_DAYS = 7;

export const isPlanId = (v: unknown): v is PlanId => typeof v === "string" && (PLAN_IDS as readonly string[]).includes(v);

/** Limits for a stored plan; accounts without a plan have none. */
export const limitsFor = (plan: string | null | undefined): PlanLimits =>
  isPlanId(plan) ? PLAN_LIMITS[plan] : { keys: null, keywordsPerKey: null, historyDays: null, callsPerDay: null, aiPostsPerMonth: null, ownAiKey: true, analysis: "full" };

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
