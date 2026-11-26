"use client";
import { Loader, Skeleton, Tooltip } from "@mantine/core";
import { IconInfoCircle, IconMessages, IconWorldWww } from "@tabler/icons-react";
import type { MediaFilters } from "@/lib/media/filters";
import { formatNumber, MEDIA_TYPE_LABEL, MOOD_KIND_LABEL } from "@/lib/media/labels";
import { MAIN_EMOTIONS, moodColorVar, moodInfo } from "@/lib/media/mood";
import type { MediaType, MoodCount } from "@/lib/media/types";
import classes from "./stats.module.css";
import { Tip } from "../ui/Tip";

const LEGEND_SIZE = 6;

function MoodBreakdown({ type, moods: all, selected, onSelect }: {
  type: MediaType; moods: MoodCount[] | null; selected: string | null; onSelect: (mood: string | null) => void;
}) {
  // Social: only the five main emotions, and the percentages are of those (they add up to 100).
  const moods = all && type === "social" ? all.filter((m) => MAIN_EMOTIONS.includes(m.value)) : all;
  const total = (moods ?? []).reduce((sum, m) => sum + m.n, 0);
  const toggle = (value: string) => onSelect(selected === value ? null : value);
  const percent = (n: number) => Math.round((n / total) * 100);

  return (
    <div className={classes.moods}>
      <div className={classes.moodHead}>
        <span className={classes.label}>{MOOD_KIND_LABEL[type]}</span>
        {moods && total > 0 && (
          <div className={classes.legend}>
            {moods.slice(0, LEGEND_SIZE).map((m) => (
              <button key={m.value} type="button" aria-pressed={selected === m.value} data-active={selected === m.value || undefined} onClick={() => toggle(m.value)}>
                <i style={{ background: moodColorVar(m.value) }} />{moodInfo(m.value).label}<b>{percent(m.n)}%</b>
              </button>
            ))}
          </div>
        )}
        {total > 0 && <Tooltip label={`Persentase dihitung dari semua ${type === "social" ? "post" : "berita"} berlabel yang cocok dengan filter dan rentang tanggal. Filter ${type === "social" ? "emosi" : "sentimen"} tidak diterapkan pada grafik, sehingga semuanya tetap dapat dibandingkan.`} withArrow multiline maw={320} events={{ hover: true, focus: true, touch: true }}>
          <button type="button" className={classes.sampleNote} aria-label={`Dasar grafik: ${formatNumber(total)} ${type === "social" ? "post" : "berita"} berlabel, tanpa filter ${type === "social" ? "emosi" : "sentimen"}.`}>{formatNumber(total)} {type === "social" ? "post" : "berita"}<IconInfoCircle size={12} aria-hidden /></button>
        </Tooltip>}
      </div>
      {!moods ? <Skeleton h={6} radius="xl" /> : total === 0 ? <span className={classes.empty}>Belum ada data teranalisis</span> : (
        <div className={classes.moodBar}>
          {moods.map((m) => (
            <Tip key={m.value} label={`${moodInfo(m.value).label}: ${formatNumber(m.n)} (${percent(m.n)}%)`}>
              <button type="button" aria-label={`${moodInfo(m.value).label}: ${percent(m.n)}%`} aria-pressed={selected === m.value}
                data-dim={(selected && selected !== m.value) || undefined} style={{ flexGrow: m.n, ["--mood-color" as string]: moodColorVar(m.value) }} onClick={() => toggle(m.value)} />
            </Tip>
          ))}
        </div>
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
  const Icon = type === "social" ? IconMessages : IconWorldWww;
  return (
    <section className={classes.bar} data-busy={busy || undefined}>
      <div className={classes.summary}>
        <span className={classes.icon}><Icon size={17} /></span>
        <div className={classes.title}>
          <b>{MEDIA_TYPE_LABEL[type]}</b>
          <span className={classes.counts}>
            {total != null ? <strong>{formatNumber(total)}</strong> : totalError ? <strong>—</strong> : <span className={classes.counting}><Loader size={10} color="cyan" />menghitung</span>}
            {" "}cocok<i aria-hidden>·</i>{busy && !shown ? "—" : formatNumber(shown)} ditampilkan
          </span>
        </div>
      </div>
      {!filters.aiCategory && <MoodBreakdown type={type} moods={moods} selected={filters.mood} onSelect={onMoodChange} />}
      {filters.aiCategory && <div className={classes.moods}><span className={classes.label}>Kategori AI <b className={classes.aiCategory}>{filters.aiCategory}</b></span><span className={classes.empty}>Hasil mengikuti kategori AI dan filter lain yang aktif.</span></div>}
      <span className={classes.scanline} aria-hidden />
    </section>
  );
}
