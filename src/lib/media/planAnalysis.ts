// Bank analysis an item carries, cut down to what the plan includes (see PLAN_LIMITS.analysis in lib/plans.ts).
//   mood    → emotion / sentiment only (mood, moodLevel); no analysis object
//   content → + summary, target, relevance
//   full    → everything (score, signals, topics, factors as well)
import type { PlanLimits } from "../plans";
import type { MediaItem } from "./types";

export function analysisForPlan<T extends Pick<MediaItem, "analysis">>(item: T, level: PlanLimits["analysis"]): T {
  if (level === "full" || !item.analysis) return item;
  if (level === "mood") return { ...item, analysis: null };
  const { summary, target, relevance } = item.analysis;
  return { ...item, analysis: { summary, target, relevance, score: null, signals: [], topics: [], factors: null } };
}
