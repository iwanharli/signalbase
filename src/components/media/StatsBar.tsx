"use client";
import { Loader, Skeleton } from "@mantine/core";
import { IconMessages, IconWorldWww } from "@tabler/icons-react";
import { rangeLabel, type MediaFilters } from "@/lib/media/filters";
import { formatNumber, MEDIA_TYPE_LABEL, MOOD_KIND_LABEL, SOURCE_KIND_LABEL, sourceLabel } from "@/lib/media/labels";
import { moodColorVar, moodInfo } from "@/lib/media/mood";
import type { MediaType, MoodCount } from "@/lib/media/types";
import classes from "./stats.module.css";

const LEGEND_SIZE = 6;
const ANALYZED_LABEL = { yes: "Sudah", no: "Belum", "": "Semua" } as const;
const LANGUAGE_LABEL = { id: "Indonesia", other: "Bahasa lain", "": "Semua" } as const;

function Stat({ label, secondary, children }: { label: string; secondary?: boolean; children: React.ReactNode }) {
  return (
    <div className={classes.stat} data-secondary={secondary || undefined}>
      <small className={classes.label}>{label}</small>
      {children}
    </div>
  );
}

function MoodBreakdown({ type, moods, selected, onSelect }: {
  type: MediaType; moods: MoodCount[] | null; selected: string | null; onSelect: (mood: string | null) => void;
}) {
  const total = (moods ?? []).reduce((sum, m) => sum + m.n, 0);
  const dominant = moods?.[0];
  const toggle = (value: string) => onSelect(selected === value ? null : value);
  const percent = (n: number) => Math.round((n / total) * 100);

  return (
    <div className={classes.moods}>
      <small className={classes.label}>
        {MOOD_KIND_LABEL[type]}
        {dominant && <> · dominan <span style={{ color: moodColorVar(dominant.value, 4) }}>{moodInfo(dominant.value).label}</span></>}
      </small>
      {!moods ? <Skeleton h={10} radius="xl" /> : total === 0 ? <span className={classes.empty}>Belum ada data teranalisis</span> : (
        <>
          <div className={classes.moodBar}>
            {moods.map((m) => (
              <button key={m.value} type="button" title={`${moodInfo(m.value).label}: ${formatNumber(m.n)} (${percent(m.n)}%)`}
                data-dim={(selected && selected !== m.value) || undefined} style={{ flexGrow: m.n, background: moodColorVar(m.value) }} onClick={() => toggle(m.value)} />
            ))}
          </div>
          <div className={classes.legend}>
            {moods.slice(0, LEGEND_SIZE).map((m) => (
              <button key={m.value} type="button" data-active={selected === m.value || undefined} onClick={() => toggle(m.value)}>
                <i style={{ background: moodColorVar(m.value) }} />{moodInfo(m.value).label}<b>{percent(m.n)}%</b>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Sticky summary of the current result set. Mood slices double as a mood filter. */
export function StatsBar({ type, filters, total, totalError, shown, moods, busy, onMoodChange }: {
  type: MediaType;
  filters: MediaFilters;
  /** Exact total, or null while it is being counted. */
  total: number | null;
  totalError: boolean;
  shown: number;
  moods: MoodCount[] | null;
  busy: boolean;
  onMoodChange: (mood: string | null) => void;
}) {
  const Icon = type === "sosial" ? IconMessages : IconWorldWww;
  return (
    <section className={classes.bar} data-busy={busy || undefined}>
      <div className={classes.identity}><span className={classes.icon}><Icon size={18} /></span>{MEDIA_TYPE_LABEL[type]}</div>
      <Stat label="Total cocok">
        {total != null ? <b className={classes.total}>{formatNumber(total)}</b>
          : totalError ? <b className={classes.total}>—</b>
          : <span className={classes.counting}><Loader size={12} color="cyan" />menghitung…</span>}
      </Stat>
      <Stat label="Ditampilkan" secondary><b>{formatNumber(shown)}</b></Stat>
      <Stat label="Rentang"><b>{rangeLabel(filters)}</b></Stat>
      <Stat label="Analisis" secondary><b>{ANALYZED_LABEL[filters.analyzed]}</b></Stat>
      <Stat label="Bahasa" secondary><b>{LANGUAGE_LABEL[filters.language]}</b></Stat>
      <Stat label={SOURCE_KIND_LABEL[type]} secondary><b>{filters.source ? sourceLabel(filters.source) : "Semua"}</b></Stat>
      <MoodBreakdown type={type} moods={moods} selected={filters.mood} onSelect={onMoodChange} />
      <span className={classes.scanline} aria-hidden />
    </section>
  );
}
