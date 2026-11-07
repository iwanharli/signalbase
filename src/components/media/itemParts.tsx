"use client";
// Small presentational pieces shared by the item card and the detail modal.
import { Badge } from "@mantine/core";
import { IconEye, IconHeart, IconMessageCircle, IconRepeat, IconRobot, IconTarget } from "@tabler/icons-react";
import { FACTOR_LABEL, formatNumber, humanize } from "@/lib/media/labels";
import { analysisState, formatMetricCount, uniqueTags } from "@/lib/media/presentation";
import { moodInfo } from "@/lib/media/mood";
import type { MediaItem, MediaType, Metrics } from "@/lib/media/types";
import classes from "./item.module.css";
import { Tip } from "../ui/Tip";

/** Scores from the AI range roughly from -3 to +3. */
const SCORE_RANGE = 3;

export const moodTone = (item: MediaItem) => `var(--mantine-color-${item.mood ? moodInfo(item.mood).color : "gray"}-5)`;

/** AI category from the API key being browsed through; "none" is shown muted. */
export function AiCategoryBadge({ item, detailed }: { item: MediaItem; detailed?: boolean }) {
  const c = item.classification;
  if (c === undefined) return null;
  if (c === null) return <span className={classes.aiCategory} data-pending><IconRobot size={12} />Belum dikategorikan</span>;
  return (
    <Tip label={c.reason}>
      <span className={classes.aiCategory} data-none={c.category === "none" || undefined}>
        <IconRobot size={12} /><b>{c.category === "none" ? "—" : c.category}</b>{c.label}
        {detailed && c.confidence != null && <em>{Math.round(c.confidence * 100)}%</em>}
        {c.manual && <em>manual</em>}
      </span>
    </Tip>
  );
}

export function MoodBadges({ item, type, onDark = false }: { item: MediaItem; type: MediaType; onDark?: boolean }) {
  const mood = item.mood?.trim() ? moodInfo(item.mood) : null;
  const relevance = item.analysis?.relevance;
  const state = analysisState(item);
  return (
    <div className={classes.moodBadges}>
      {mood
        ? <Badge size="sm" radius="sm" variant="light" color={mood.color} styles={onDark ? { root: { color: `var(--mantine-color-${mood.color}-3)`, background: `color-mix(in srgb, var(--mantine-color-${mood.color}-5) 16%, transparent)` } } : undefined}>{mood.label}{item.moodLevel ? ` · ${item.moodLevel}/5` : ""}</Badge>
        : <Tip label={state === "unlabelled" ? "Analisis sumber sudah tersedia, tetapi belum memiliki label emosi atau sentimen." : "Belum ada analisis sumber untuk item ini."}>
            <Badge size="sm" radius="sm" variant="default" c={onDark ? "#d9d6e7" : "dimmed"} styles={onDark ? { root: { background: "rgba(255,255,255,.07)", borderColor: "rgba(255,255,255,.15)" } } : undefined}>{state === "unlabelled" ? `Tanpa label ${type === "social" ? "emosi" : "sentimen"}` : "Belum dianalisis"}</Badge>
          </Tip>}
      {relevance === "watchlist" && <span className={classes.relevance} data-watchlist>Watchlist</span>}
      {relevance === "exclude" && <span className={classes.relevance}>Tidak relevan</span>}
    </div>
  );
}

function Metric({ icon: Icon, value, label, compact }: { icon: typeof IconEye; value: number | null; label: string; compact?: boolean }) {
  if (value == null) return null;
  const description = `${label}: ${formatNumber(value)}`;
  return <Tip label={description}><span className={classes.metric} aria-label={description}><Icon size={14} aria-hidden />{compact ? formatMetricCount(value) : formatNumber(value)}</span></Tip>;
}

/** Missing values stay hidden; zero is a valid count. */
export function MetricList({ metrics, compact = false }: { metrics: Metrics; compact?: boolean }) {
  return (
    <>
      <Metric icon={IconHeart} value={metrics.likes} label="Suka" compact={compact} />
      <Metric icon={IconMessageCircle} value={metrics.comments} label="Komentar" compact={compact} />
      <Metric icon={IconRepeat} value={metrics.shares} label="Bagikan / repost" compact={compact} />
      <Metric icon={IconEye} value={metrics.views} label="Tayangan" compact={compact} />
    </>
  );
}

export function MetaItem({ icon: Icon, children, capitalize }: { icon?: typeof IconEye; children: React.ReactNode; capitalize?: boolean }) {
  return <span className={classes.metric} style={capitalize ? { textTransform: "capitalize" } : undefined}>{Icon && <Icon size={13} />}{children}</span>;
}

export function TargetTag({ target }: { target: string }) {
  return <span className={classes.target}><IconTarget size={12} />{target}</span>;
}

/** Hashtag-style chips; shows `limit` and a "+n" chip for the rest. */
export function Tags({ values, limit, children }: { values: string[]; limit?: number; children?: React.ReactNode }) {
  const unique = uniqueTags(values);
  const shown = limit ? unique.slice(0, limit) : unique;
  const hidden = unique.length - shown.length;
  return (
    <div className={classes.tags}>
      {children}
      {shown.map((v) => <span key={v} className={classes.tag}>#{humanize(v)}</span>)}
      {hidden > 0 && <span className={classes.tag}>+{hidden}</span>}
    </div>
  );
}


export function ScoreMeter({ score }: { score: number }) {
  const tone = score < 0 ? "negative" : score > 0 ? "positive" : "neutral";
  const position = Math.min(100, Math.max(0, ((score + SCORE_RANGE) / (2 * SCORE_RANGE)) * 100));
  return (
    <div className={classes.score}>
      <div className={classes.scoreTrack}><i style={{ left: `${position}%` }} data-tone={tone} /></div>
      <b data-tone={tone}>{score > 0 ? "+" : ""}{score.toFixed(1)}</b>
    </div>
  );
}

/** Factor ratings (1–5) as dot scales. */
export function FactorGrid({ factors }: { factors: [string, number][] }) {
  return (
    <div className={classes.factors}>
      {factors.map(([key, value]) => (
        <div key={key} className={classes.factor}>
          <span>{FACTOR_LABEL[key] ?? humanize(key)}</span>
          <div className={classes.dots}>{[1, 2, 3, 4, 5].map((n) => <i key={n} data-on={n <= value || undefined} />)}</div>
        </div>
      ))}
    </div>
  );
}

/** Numeric factor entries of an analysis. */
export const numericFactors = (factors: Record<string, number> | null | undefined) =>
  Object.entries(factors ?? {}).filter((entry): entry is [string, number] => typeof entry[1] === "number");
