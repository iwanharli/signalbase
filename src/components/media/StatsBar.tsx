"use client";
import { Loader, Skeleton, Tooltip } from "@mantine/core";
import { IconCalendar, IconInfoCircle, IconLanguage, IconMessages, IconRobot, IconWorldWww } from "@tabler/icons-react";
import { rangeLabel, type MediaFilters } from "@/lib/media/filters";
import { formatNumber, MEDIA_TYPE_LABEL, MOOD_KIND_LABEL, SOURCE_KIND_LABEL, sourceLabel } from "@/lib/media/labels";
import { MAIN_EMOTIONS, moodColorVar, moodInfo } from "@/lib/media/mood";
import type { MediaType, MoodCount } from "@/lib/media/types";
import { PlatformMark } from "./PlatformIcon";
import classes from "./stats.module.css";
import { Tip } from "../ui/Tip";

const LEGEND_SIZE = 6;
const ANALYZED_LABEL = { yes: "Sudah dianalisis", no: "Belum dianalisis", "": "Semua status" } as const;
const LANGUAGE_LABEL = { id: "Bahasa Indonesia", other: "Bahasa lain", "": "Semua bahasa" } as const;

function MoodBreakdown({ type, moods: all, selected, onSelect }: {
  type: MediaType; moods: MoodCount[] | null; selected: string | null; onSelect: (mood: string | null) => void;
}) {
  // Social: only the five main emotions, and the percentages are of those (they add up to 100).
  const moods = all && type === "social" ? all.filter((m) => MAIN_EMOTIONS.includes(m.value)) : all;
  const total = (moods ?? []).reduce((sum, m) => sum + m.n, 0);
  const dominant = moods?.[0];
  const toggle = (value: string) => onSelect(selected === value ? null : value);
  const percent = (n: number) => Math.round((n / total) * 100);
  const noun = type === "social" ? "post" : "berita";

  return (
    <div className={classes.moods}>
      <div className={classes.moodHead}>
        <span className={classes.heading}>
          {MOOD_KIND_LABEL[type]}
          {dominant && total > 0 && <> · dominan <strong style={{ color: moodColorVar(dominant.value, 4) }}>{moodInfo(dominant.value).label} {percent(dominant.n)}%</strong></>}
        </span>
        {total > 0 && <Tooltip label={`Persentase dihitung dari semua ${noun} berlabel yang cocok dengan filter dan rentang tanggal. Filter ${type === "social" ? "emosi" : "sentimen"} tidak diterapkan pada grafik, sehingga semuanya tetap dapat dibandingkan.`} withArrow multiline maw={320} events={{ hover: true, focus: true, touch: true }}>
          <button type="button" className={classes.sampleNote} aria-label={`Dasar grafik: ${formatNumber(total)} ${noun} berlabel, tanpa filter ${type === "social" ? "emosi" : "sentimen"}.`}>Dari {formatNumber(total)} {noun} berlabel<IconInfoCircle size={12} aria-hidden /></button>
        </Tooltip>}
      </div>
      {!moods ? <><Skeleton h={10} radius="xl" /><Skeleton h={34} radius="md" /></> : total === 0 ? <span className={classes.empty}>Belum ada data teranalisis</span> : (
        <>
          <div className={classes.moodBar}>
            {moods.map((m) => (
              <Tip key={m.value} label={`${moodInfo(m.value).label}: ${formatNumber(m.n)} (${percent(m.n)}%)`}>
                <button type="button" aria-label={`${moodInfo(m.value).label}: ${percent(m.n)}%`} aria-pressed={selected === m.value}
                  data-dim={(selected && selected !== m.value) || undefined} style={{ flexGrow: m.n, ["--mood-color" as string]: moodColorVar(m.value) }} onClick={() => toggle(m.value)} />
              </Tip>
            ))}
          </div>
          <div className={classes.legend}>
            {moods.slice(0, LEGEND_SIZE).map((m) => (
              <button key={m.value} type="button" aria-pressed={selected === m.value} data-active={selected === m.value || undefined} onClick={() => toggle(m.value)}
                style={{ ["--mood-color" as string]: moodColorVar(m.value) }} title={selected === m.value ? "Klik lagi untuk melepas filter" : `Tampilkan hanya ${moodInfo(m.value).label}`}>
                <span className={classes.legendName}><i />{moodInfo(m.value).label}</span>
                <span className={classes.legendValue}><b>{percent(m.n)}%</b><small>{formatNumber(m.n)}</small></span>
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
  const Icon = type === "social" ? IconMessages : IconWorldWww;
  const noun = type === "social" ? "post" : "berita";
  return (
    <section className={classes.bar} data-busy={busy || undefined}>
      <div className={classes.summary}>
        <div className={classes.identity}><span className={classes.icon}><Icon size={17} /></span>{MEDIA_TYPE_LABEL[type]}</div>
        <div className={classes.numbers}>
          <div className={classes.stat}>
            {total != null ? <b className={classes.total}>{formatNumber(total)}</b>
              : totalError ? <b className={classes.total}>—</b>
              : <span className={classes.counting}><Loader size={12} color="cyan" />Menghitung…</span>}
            <small>{noun} cocok</small>
          </div>
          <div className={classes.stat}>
            <b>{busy && !shown ? "—" : formatNumber(shown)}</b>
            <small>ditampilkan</small>
          </div>
        </div>
        <ul className={classes.context} aria-label="Cakupan hasil">
          <li><IconCalendar size={13} />{rangeLabel(filters)}</li>
          <li>{type === "social" ? <PlatformMark source={filters.source} size={13} /> : <IconWorldWww size={13} />}{filters.source ? sourceLabel(filters.source) : `Semua ${SOURCE_KIND_LABEL[type].toLowerCase()}`}</li>
          <li><IconLanguage size={13} />{LANGUAGE_LABEL[filters.language]}</li>
          <li><IconRobot size={13} />{ANALYZED_LABEL[filters.analyzed]}</li>
        </ul>
      </div>
      {!filters.aiCategory && <MoodBreakdown type={type} moods={moods} selected={filters.mood} onSelect={onMoodChange} />}
      {filters.aiCategory && <div className={classes.moods}><span className={classes.heading}>Kategori AI <strong>{filters.aiCategory}</strong></span><span className={classes.empty}>Hasil mengikuti kategori AI dan filter lain yang aktif.</span></div>}
      <span className={classes.scanline} aria-hidden />
    </section>
  );
}
