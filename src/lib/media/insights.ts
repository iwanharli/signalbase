// Shape of the Ringkasan "Analisis periode" data, shared by the API route and the page.
import type { MediaItem } from "./types";

export const INSIGHT_PERIODS = [7, 14, 30] as const;
export type InsightPeriod = (typeof INSIGHT_PERIODS)[number];
export const isInsightPeriod = (n: number): n is InsightPeriod => (INSIGHT_PERIODS as readonly number[]).includes(n);

/** One rolling 24-hour window; `day` is the date the window ends on. Only labelled items count towards pos/neu/neg. */
export type TrendPoint = { day: string; total: number; pos: number; neu: number; neg: number };
/** A ranked value with its count in this period and in the period before. */
export type Ranked = { value: string; n: number; prev: number; neg?: number };
export type PeriodTotals = { total: number; labelled: number; pos: number; neg: number };

export type Alert =
  | { kind: "spike"; label: string; source: "category" | "keyword"; n: number; avg: number }
  | { kind: "negative"; share: number; avgShare: number; n: number }
  | { kind: "intense"; n: number };

/** Last 24 hours and the daily average of the 7 days before, for the early-warning indicators. */
export type PulseWindow = { total: number; labelled: number; neg: number; hot: number };
export type Pulse = { now: PulseWindow; avg: PulseWindow };

/** Engagement totals of one platform. A metric is null when the platform doesn't record it. */
export type EngagementMetrics = { likes: number | null; comments: number | null; shares: number | null; views: number | null };
export type PlatformEngagement = { source: string; posts: number; current: EngagementMetrics; previous: EngagementMetrics };

/** Most active social account: posts this period and the one before, how many were labelled and negative, likes. */
export type TopAccount = {
  source: string; username: string; name: string | null; profileUrl: string | null;
  n: number; prev: number; labelled: number; neg: number; likes: number;
};
/** Most active news outlet, same counts without likes. */
export type TopMedia = { source: string; n: number; prev: number; labelled: number; neg: number };

export type Insights = {
  period: InsightPeriod;
  trend: TrendPoint[];
  current: PeriodTotals;
  previous: PeriodTotals;
  categories: Ranked[];
  keywords: Ranked[] | null;
  hashtags: Ranked[] | null;
  alerts: Alert[];
  pulse: Pulse;
  /** Social only: likes, comments and shares per platform, this period and the one before. */
  engagement: PlatformEngagement[] | null;
  /** Social only: the 10 accounts with the most posts overall, plus the 10 of each platform (busiest first). */
  accounts: TopAccount[] | null;
  /** Online only: the 10 outlets with the most articles. */
  media: TopMedia[] | null;
  /** Newest high-intensity negative posts of the last 24 hours (social only). */
  intense: MediaItem[];
  at: string;
};
