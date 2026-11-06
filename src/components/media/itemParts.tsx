"use client";
// Small presentational pieces shared by the item card and the detail modal.
import { Badge, Group } from "@mantine/core";
import { IconEye, IconHeart, IconMessageCircle, IconRepeat, IconTarget } from "@tabler/icons-react";
import { FACTOR_LABEL, formatNumber, humanize } from "@/lib/media/labels";
import { moodInfo } from "@/lib/media/mood";
import type { MediaItem, Metrics } from "@/lib/media/types";
import classes from "./item.module.css";

/** Scores from the AI range roughly from -3 to +3. */
const SCORE_RANGE = 3;

export const moodTone = (item: MediaItem) => `var(--mantine-color-${item.mood ? moodInfo(item.mood).color : "gray"}-5)`;

export function MoodBadges({ item }: { item: MediaItem }) {
  const mood = item.mood ? moodInfo(item.mood) : null;
  const relevance = item.analysis?.relevance;
  return (
    <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
      {relevance === "watchlist" && <Badge size="sm" radius="sm" variant="light" color="yellow">Watchlist</Badge>}
      {relevance === "exclude" && <Badge size="sm" radius="sm" variant="default" c="dimmed">Tidak relevan</Badge>}
      {mood
        ? <Badge size="sm" radius="sm" variant="light" color={mood.color}>{mood.label}{item.moodLevel ? ` · ${item.moodLevel}/5` : ""}</Badge>
        : <Badge size="sm" radius="sm" variant="default" c="dimmed">Belum dianalisis</Badge>}
    </Group>
  );
}

function Metric({ icon: Icon, value }: { icon: typeof IconEye; value: number | null }) {
  if (value == null) return null;
  return <span className={classes.metric}><Icon size={14} />{formatNumber(value)}</span>;
}

/** Likes, comments, shares and views; missing values are skipped. */
export function MetricList({ metrics }: { metrics: Metrics }) {
  return (
    <>
      <Metric icon={IconHeart} value={metrics.likes} />
      <Metric icon={IconMessageCircle} value={metrics.comments} />
      <Metric icon={IconRepeat} value={metrics.shares} />
      <Metric icon={IconEye} value={metrics.views} />
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
  const shown = limit ? values.slice(0, limit) : values;
  const hidden = values.length - shown.length;
  return (
    <div className={classes.tags}>
      {children}
      {shown.map((v) => <span key={v} className={classes.tag}>#{humanize(v)}</span>)}
      {hidden > 0 && <span className={classes.tag}>+{hidden}</span>}
    </div>
  );
}

export function DashboardTags({ values }: { values: string[] }) {
  return <div className={classes.tags}>{values.map((v) => <span key={v} className={classes.dashboard}>{v}</span>)}</div>;
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
