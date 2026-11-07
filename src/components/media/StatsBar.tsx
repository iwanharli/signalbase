"use client";
import { Loader, Skeleton, Tooltip } from "@mantine/core";
import { IconInfoCircle, IconMessages, IconWorldWww } from "@tabler/icons-react";
import { rangeLabel, type MediaFilters } from "@/lib/media/filters";
import { formatNumber, MEDIA_TYPE_LABEL, MOOD_KIND_LABEL, SOURCE_KIND_LABEL, sourceLabel } from "@/lib/media/labels";
import { moodColorVar, moodInfo } from "@/lib/media/mood";
import { MOOD_SAMPLE_LIMIT } from "@/lib/media/types";
import type { MediaType, MoodCount } from "@/lib/media/types";
import classes from "./stats.module.css";
import { Tip } from "../ui/Tip";

const LEGEND_SIZE = 6;
const ANALYZED_LABEL = { yes: "Sudah dianalisis", no: "Belum dianalisis", "": "Semua" } as const;
const LANGUAGE_LABEL = { id: "Indonesia", other: "Bahasa lain", "": "Semua" } as const;

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={classes.stat}>
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
      <div className={classes.moodHead}>
        <span className={classes.label}>{MOOD_KIND_LABEL[type]}{dominant && <> · dominan <strong style={{ color: moodColorVar(dominant.value, 4) }}>{moodInfo(dominant.value).label}</strong></>}</span>
        {type === "social" && <Tooltip label="Persentase dihitung dari post berlabel dalam maksimal 10.000 post terbaru yang cocok. Filter emosi tidak diterapkan pada grafik, sehingga seluruh emosi tetap dapat dibandingkan." withArrow multiline maw={320} events={{ hover: true, focus: true, touch: true }}>
          <button type="button" className={classes.sampleNote} aria-label="Dasar grafik: maksimal 10.000 post terbaru yang cocok, persentase dari post berlabel, tanpa filter emosi.">Maks. {formatNumber(MOOD_SAMPLE_LIMIT)} post<IconInfoCircle size={13} aria-hidden /></button>
        </Tooltip>}
      </div>
      {!moods ? <Skeleton h={10} radius="xl" /> : total === 0 ? <span className={classes.empty}>Belum ada data teranalisis</span> : (
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
              <button key={m.value} type="button" aria-pressed={selected === m.value} data-active={selected === m.value || undefined} onClick={() => toggle(m.value)}>
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
  const Icon = type === "social" ? IconMessages : IconWorldWww;
  return (
    <section className={classes.bar} data-busy={busy || undefined}>
      <div className={classes.summary}>
        <div className={classes.summaryTop}>
          <div className={classes.identity}><span className={classes.icon}><Icon size={18} /></span>{MEDIA_TYPE_LABEL[type]}</div>
          <Stat label="Total cocok">
            {total != null ? <b className={classes.total}>{formatNumber(total)}</b>
              : totalError ? <b className={classes.total}>—</b>
              : <span className={classes.counting}><Loader size={12} color="cyan" />Menghitung…</span>}
          </Stat>
          <Stat label="Ditampilkan"><b>{formatNumber(shown)}</b></Stat>
        </div>
        <div className={classes.context}>
          <span><small>Rentang</small>{rangeLabel(filters)}</span>
          <span><small>{type === "social" ? "Emosi" : "Sentimen"}</small>{ANALYZED_LABEL[filters.analyzed]}</span>
          <span><small>Bahasa</small>{LANGUAGE_LABEL[filters.language]}</span>
          <span><small>{SOURCE_KIND_LABEL[type]}</small>{filters.source ? sourceLabel(filters.source) : "Semua"}</span>
        </div>
      </div>
      {!filters.aiCategory && <MoodBreakdown type={type} moods={moods} selected={filters.mood} onSelect={onMoodChange} />}
      {filters.aiCategory && <div className={classes.moods}><small className={classes.label}>Kategori AI</small><b>{filters.aiCategory}</b><span className={classes.empty}>Hasil mengikuti kategori AI dan filter lain yang aktif.</span></div>}
      <span className={classes.scanline} aria-hidden />
    </section>
  );
}
