"use client";
// Ringkasan "Analisis periode" for all media, social or online, over 7/14/30 days: an early-warning board (three
// indicators, always shown, plus the most intense negative posts), the opinion trend, this period vs the one before,
// top topics, the project's keywords and hashtags. Both types are always fetched, so "Semua" is merged in the browser.
// Loads apart from the rest of the page because the grouped scans take a few seconds when the cache is cold.
import { useState } from "react";
import Link from "next/link";
import { Alert as MantineAlert, SegmentedControl, Skeleton } from "@mantine/core";
import {
  IconArrowDownRight, IconArrowRight, IconArrowUpRight, IconBolt, IconFlame, IconHash, IconLayoutGrid, IconMessages, IconMoodSad,
  IconTag, IconTrendingUp, IconWorldWww,
} from "@tabler/icons-react";
import dayjs from "dayjs";
import "dayjs/locale/id";
import relativeTime from "dayjs/plugin/relativeTime";
import {
  INSIGHT_PERIODS, type Alert, type InsightPeriod, type Insights as InsightsData, type PeriodTotals, type PulseWindow, type Ranked,
} from "@/lib/media/insights";
import { capitalize, formatNumber, humanize, MEDIA_TYPE_LABEL, sourceLabel } from "@/lib/media/labels";
import type { MediaItem, MediaType } from "@/lib/media/types";
import { useApi } from "@/lib/useApi";
import c from "./insights.module.css";

dayjs.extend(relativeTime);

type Response = { insights: InsightsData | null };
type View = "all" | MediaType;
type Tone = "pos" | "neu" | "neg";
/** A ranked value tagged with the media type it mostly comes from, so links open the right page. */
type Row = Ranked & { t: MediaType };
type Spike = Extract<Alert, { kind: "spike" }> & { t: MediaType };
/** What the page shows for the chosen view: one type, or both merged. */
type ViewData = {
  trend: InsightsData["trend"]; current: PeriodTotals; previous: PeriodTotals; at: string;
  categories: Row[]; keywords: Row[] | null; hashtags: Row[] | null;
  now: PulseWindow; avg: PulseWindow; spikes: Spike[]; intense: MediaItem[]; hasSocial: boolean;
};

const TONES: { key: Tone; label: string }[] = [
  { key: "neg", label: "Negatif" },
  { key: "neu", label: "Netral" },
  { key: "pos", label: "Positif" },
];
const VIEW_LABEL: Record<View, string> = { all: "Semua media", social: MEDIA_TYPE_LABEL.social, online: MEDIA_TYPE_LABEL.online };
const VIEW_ICON = { all: IconLayoutGrid, social: IconMessages, online: IconWorldWww } as const;
const TOP_ROWS = 8;
/** Below this previous count a percentage change is noise (5 → 105 is "+2.000%"), so it reads "baru" instead. */
const MIN_BASE = 20;
/** Early-warning thresholds (the server applies the same ones to spikes and the negative share). */
const NEGATIVE_SHIFT_POINTS = 8;
const NEGATIVE_MIN_LABELLED = 30;
const INTENSE_RATIO = 1.5;
const INTENSE_MIN = 10;

const pct = (n: number, d: number) => (d ? (n / d) * 100 : 0);
const fmtPct = (v: number) => `${v.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;
const topicLabel = (value: string) => capitalize(humanize(value));
const yesterday = () => dayjs().subtract(1, "day").format("YYYY-MM-DD");
const sumWindow = (a: PulseWindow, b: PulseWindow): PulseWindow => ({ total: a.total + b.total, labelled: a.labelled + b.labelled, neg: a.neg + b.neg, hot: a.hot + b.hot });
const sumTotals = (a: PeriodTotals, b: PeriodTotals): PeriodTotals => ({ total: a.total + b.total, labelled: a.labelled + b.labelled, pos: a.pos + b.pos, neg: a.neg + b.neg });

/** Post text without the reply preamble and leading @mentions, which say nothing about the content. */
function cleanText(item: MediaItem) {
  const raw = (item.title ?? item.content ?? "").replace(/\s+/g, " ").trim();
  const text = raw.replace(/^replying to\s+/i, "").replace(/^(@[\w.]+[\s,]*)+/, "").trim();
  return text || raw;
}

/** Link into the media browser, keeping the project being viewed. */
function mediaHref(type: MediaType, keyId: string | null, params: Record<string, string>) {
  const q = new URLSearchParams(params);
  if (keyId) q.set("key", keyId);
  return `/media/${type}?${q}`;
}

/** Ranked lists from one or both types, summed per value; each value links to the type it mostly comes from. */
function mergeRanked(parts: [MediaType, Ranked[] | null | undefined][], limit = TOP_ROWS): Row[] | null {
  if (parts.every(([, list]) => !list)) return null;
  const byValue = new Map<string, Row & { best: number }>();
  for (const [t, list] of parts) for (const r of list ?? []) {
    const e = byValue.get(r.value) ?? { value: r.value, n: 0, prev: 0, t, best: -1 };
    e.n += r.n; e.prev += r.prev;
    if (r.neg !== undefined) e.neg = (e.neg ?? 0) + r.neg;
    if (r.n > e.best) { e.best = r.n; e.t = t; }
    byValue.set(r.value, e);
  }
  return [...byValue.values()].sort((a, b) => b.n - a.n).slice(0, limit).map((e) => ({ value: e.value, n: e.n, prev: e.prev, neg: e.neg, t: e.t }));
}

function viewData(parts: [MediaType, InsightsData][]): ViewData | null {
  if (!parts.length) return null;
  const [first, ...rest] = parts.map(([, d]) => d);
  const social = parts.find(([t]) => t === "social")?.[1];
  return {
    trend: first.trend.map((p, i) => rest.reduce((acc, d) => {
      const q = d.trend[i];
      return q ? { ...acc, total: acc.total + q.total, pos: acc.pos + q.pos, neu: acc.neu + q.neu, neg: acc.neg + q.neg } : acc;
    }, p)),
    current: rest.reduce((acc, d) => sumTotals(acc, d.current), first.current),
    previous: rest.reduce((acc, d) => sumTotals(acc, d.previous), first.previous),
    at: parts.map(([, d]) => d.at).sort().at(-1)!,
    categories: mergeRanked(parts.map(([t, d]) => [t, d.categories])) ?? [],
    keywords: mergeRanked(parts.map(([t, d]) => [t, d.keywords]), 30),
    hashtags: social?.hashtags ? social.hashtags.map((h) => ({ ...h, t: "social" as const })) : null,
    now: rest.reduce((acc, d) => sumWindow(acc, d.pulse.now), first.pulse.now),
    avg: rest.reduce((acc, d) => sumWindow(acc, d.pulse.avg), first.pulse.avg),
    spikes: parts.flatMap(([t, d]) => d.alerts.filter((a): a is Extract<Alert, { kind: "spike" }> => a.kind === "spike").map((a) => ({ ...a, t }))),
    intense: social?.intense ?? [],
    hasSocial: !!social,
  };
}

// ── Early warning ───────────────────────────────────────────────────────────────

function Indicator({ icon: Icon, label, value, detail, warn, na, href }: {
  icon: typeof IconFlame; label: string; value: string; detail: React.ReactNode; warn: boolean; na?: boolean; href?: string;
}) {
  const body = (
    <>
      <div className={c.indTop}>
        <span className={c.indIcon}><Icon size={17} /></span>
        <span className={c.indLabel}>{label}</span>
        <span className={c.indStatus}>{na ? "Tidak berlaku" : warn ? "Waspada" : "Normal"}</span>
      </div>
      <b className={c.indValue}>{value}</b>
      <span className={c.indDetail}>{detail}</span>
    </>
  );
  const state = na ? "na" : warn ? "warn" : "ok";
  return href && !na
    ? <Link href={href} className={c.indicator} data-state={state}>{body}</Link>
    : <div className={c.indicator} data-state={state}>{body}</div>;
}

function EarlyWarning({ data, view, keyId }: { data: ViewData | null; view: View; keyId: string | null }) {
  if (!data) {
    return (
      <section className={c.warning}>
        <header className={c.warningHead}><div><h3>Peringatan dini</h3><p>24 jam terakhir dibanding rata-rata harian 7 hari sebelumnya</p></div></header>
        <div className={c.indicators}>{[0, 1, 2].map((i) => <Skeleton key={i} h={118} radius="lg" />)}</div>
      </section>
    );
  }
  const { now, avg, spikes, intense } = data;
  const share = pct(now.neg, now.labelled), avgShare = pct(avg.neg, avg.labelled);
  const negWarn = now.labelled >= NEGATIVE_MIN_LABELLED && share - avgShare >= NEGATIVE_SHIFT_POINTS;
  const hotWarn = now.hot >= INTENSE_MIN && now.hot >= avg.hot * INTENSE_RATIO;
  const anyWarn = negWarn || hotWarn || spikes.length > 0;
  const typeForLinks: MediaType = view === "online" ? "online" : "social";
  const ratio = (s: Spike) => s.n / Math.max(1, s.avg);

  return (
    <section className={c.warning} data-warn={anyWarn || undefined}>
      <header className={c.warningHead}>
        <div><h3>Peringatan dini</h3><p>24 jam terakhir dibanding rata-rata harian 7 hari sebelumnya · {VIEW_LABEL[view]}</p></div>
        <span className={c.overall} data-warn={anyWarn || undefined}><i />{anyWarn ? "Perlu perhatian" : "Situasi normal"}</span>
      </header>

      <div className={c.indicators}>
        <Indicator icon={IconFlame} label="Intensitas sangat tinggi" na={!data.hasSocial} warn={hotWarn}
          href={mediaHref("social", keyId, { level: "5", from: yesterday() })}
          value={data.hasSocial ? formatNumber(now.hot) : "—"}
          detail={data.hasSocial ? <>post negatif level 5 · biasanya {formatNumber(avg.hot)}/hari</> : "Hanya untuk media sosial"} />
        <Indicator icon={IconMoodSad} label="Porsi negatif" warn={negWarn}
          href={mediaHref(typeForLinks, keyId, { from: yesterday() })}
          value={now.labelled ? fmtPct(share) : "—"}
          detail={<>rata-rata {fmtPct(avgShare)} · <DeltaInline now={share} before={avgShare} /></>} />
        <Indicator icon={IconBolt} label="Lonjakan topik & keyword" warn={spikes.length > 0}
          value={spikes.length ? `${spikes.length} lonjakan` : "Tidak ada"}
          detail={spikes.length ? `tertinggi ${ratio([...spikes].sort((a, b) => ratio(b) - ratio(a))[0]).toFixed(1).replace(".", ",")}× dari biasanya` : "semua topik dalam batas wajar"} />
      </div>

      {spikes.length > 0 && (
        <div className={c.spikes}>
          {spikes.map((s) => (
            <Link key={`${s.t}-${s.source}-${s.label}`} className={c.spike}
              href={mediaHref(s.t, keyId, s.source === "keyword" ? { q: s.label, from: yesterday() } : { category: s.label, from: yesterday() })}>
              <IconTrendingUp size={14} />
              <b>{s.source === "keyword" ? `“${s.label}”` : topicLabel(s.label)}</b>
              <span>{formatNumber(s.n)} · {ratio(s).toFixed(1).replace(".", ",")}×</span>
            </Link>
          ))}
        </div>
      )}

      {intense.length > 0 && (
        <div className={c.posts}>
          <div className={c.postsHead}>
            <span>Post negatif paling intens</span>
            <Link href={mediaHref("social", keyId, { level: "5", from: yesterday() })}>Lihat semua <IconArrowRight size={13} /></Link>
          </div>
          <div className={c.postGrid}>
            {intense.map((item) => (
              <Link key={item.code} href={mediaHref("social", keyId, { level: "5", from: yesterday() })} className={c.post}>
                <span className={c.postAuthor}>
                  <i>{(item.author?.name ?? item.author?.username ?? "?").charAt(0).toUpperCase()}</i>
                  <span><b>{item.author?.name ?? item.author?.username ?? "Akun tidak diketahui"}</b>
                    <small>{item.author?.username && item.author.username !== item.author.name ? `@${item.author.username} · ` : ""}{sourceLabel(item.source)} · {dayjs(item.publishedAt).locale("id").fromNow()}</small></span>
                </span>
                <p>{cleanText(item)}</p>
                {item.mood && <span className={c.postMood}>{capitalize(item.mood)} · level {item.moodLevel ?? 5}</span>}
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function DeltaInline({ now, before }: { now: number; before: number }) {
  const d = now - before;
  if (Math.abs(d) < 0.05) return <>tetap</>;
  return <span data-tone={d > 0 ? "bad" : "good"} className={c.inlineDelta}>{d > 0 ? "+" : "−"}{Math.abs(d).toLocaleString("id-ID", { maximumFractionDigits: 1 })} poin</span>;
}

// ── Charts and lists ────────────────────────────────────────────────────────────

/** 100% stacked bars of opinion per 24-hour window, with the volume in the tooltip. */
function Trend({ data }: { data: ViewData }) {
  const [hover, setHover] = useState<number | null>(null);
  const { labelled, pos, neg } = data.current;
  const share: Record<Tone, number> = { neg: pct(neg, labelled), pos: pct(pos, labelled), neu: pct(labelled - pos - neg, labelled) };
  const dense = data.trend.length > 14;
  return (
    <div className={c.trend}>
      <div className={c.trendLegend}>
        {TONES.map((t) => <span key={t.key}><i data-tone={t.key} />{t.label}<b>{fmtPct(share[t.key])}</b></span>)}
      </div>
      <div className={c.bars} data-dense={dense || undefined} onMouseLeave={() => setHover(null)}>
        {data.trend.map((p, i) => {
          const n = p.pos + p.neu + p.neg;
          return (
            <div key={p.day} className={c.bar} tabIndex={0} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
              aria-label={`${dayjs(p.day).locale("id").format("D MMMM")}: ${formatNumber(p.total)} item, negatif ${fmtPct(pct(p.neg, n))}, netral ${fmtPct(pct(p.neu, n))}, positif ${fmtPct(pct(p.pos, n))}`}>
              <div className={c.stack} data-empty={!n || undefined}>
                {n > 0 && TONES.map((t) => <i key={t.key} data-tone={t.key} style={{ flexGrow: p[t.key] }} />)}
              </div>
              {(!dense || i % 5 === data.trend.length % 5 || i === data.trend.length - 1) && <small>{dayjs(p.day).format("D/M")}</small>}
              {hover === i && (
                <span className={c.tip} data-side={i > data.trend.length / 2 ? "left" : undefined}>
                  <b>{dayjs(p.day).locale("id").format("D MMM")}{i === data.trend.length - 1 ? " · 24 jam terakhir" : ""}</b>
                  <span>{formatNumber(p.total)} item · {formatNumber(n)} teranalisis</span>
                  {TONES.map((t) => <span key={t.key}><i data-tone={t.key} />{t.label} <em>{fmtPct(pct(p[t.key], n))}</em></span>)}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <p className={c.note}>Porsi dari item yang sudah dianalisis AI, per 24 jam. Arahkan kursor ke batang untuk detail.</p>
    </div>
  );
}

/** Change from the previous period, as a signed percentage (volume) or percentage points (shares). */
function Delta({ now, before, points, goodWhenUp }: { now: number; before: number; points?: boolean; goodWhenUp?: boolean }) {
  if (!points && before < MIN_BASE) return <span className={c.delta}>{now > before ? "baru" : "—"}</span>;
  const change = points ? now - before : ((now - before) / before) * 100;
  if (Math.abs(change) < 0.05) return <span className={c.delta}>tetap</span>;
  const up = change > 0;
  const tone = goodWhenUp === undefined ? undefined : up === goodWhenUp ? "good" : "bad";
  return (
    <span className={c.delta} data-tone={tone}>
      {up ? <IconArrowUpRight size={13} /> : <IconArrowDownRight size={13} />}
      {Math.abs(change).toLocaleString("id-ID", { maximumFractionDigits: 1 })}{points ? " poin" : "%"}
    </span>
  );
}

function Compare({ current, previous, period }: { current: PeriodTotals; previous: PeriodTotals; period: number }) {
  const neg = [pct(current.neg, current.labelled), pct(previous.neg, previous.labelled)];
  const pos = [pct(current.pos, current.labelled), pct(previous.pos, previous.labelled)];
  const rows = [
    { label: "Volume", value: formatNumber(current.total), delta: <Delta now={current.total} before={previous.total} />, sub: `sebelumnya ${formatNumber(previous.total)}` },
    { label: "Porsi negatif", value: fmtPct(neg[0]), delta: <Delta now={neg[0]} before={neg[1]} points goodWhenUp={false} />, sub: `sebelumnya ${fmtPct(neg[1])}` },
    { label: "Porsi positif", value: fmtPct(pos[0]), delta: <Delta now={pos[0]} before={pos[1]} points goodWhenUp />, sub: `sebelumnya ${fmtPct(pos[1])}` },
    { label: "Teranalisis AI", value: fmtPct(pct(current.labelled, current.total)), delta: null, sub: `${formatNumber(current.labelled)} item` },
  ];
  return (
    <div className={c.compare}>
      {rows.map((r) => (
        <div key={r.label}>
          <small>{r.label}</small>
          <b>{r.value}{r.delta}</b>
          <span>{r.sub}</span>
        </div>
      ))}
      <p className={c.note}>{period} hari terakhir dibanding {period} hari sebelumnya.</p>
    </div>
  );
}

function RankedList({ items, label, href, showNeg }: { items: Row[]; label: (v: string) => string; href: (row: Row) => string; showNeg?: boolean }) {
  if (!items.length) return <p className={c.empty}>Belum ada data pada periode ini.</p>;
  const max = Math.max(1, ...items.map((i) => i.n));
  return (
    <ol className={c.ranked}>
      {items.map((item, i) => (
        <li key={item.value} style={{ animationDelay: `${i * 40}ms` }}>
          <Link href={href(item)}>
            <span className={c.rankLabel}>{label(item.value)}</span>
            <span className={c.rankValue}>{formatNumber(item.n)}<Delta now={item.n} before={item.prev} /></span>
            <span className={c.rankBar}><i style={{ width: `${(item.n / max) * 100}%` }} /></span>
            {showNeg && item.neg !== undefined && <span className={c.rankNeg}>{fmtPct(pct(item.neg, item.n))} negatif</span>}
          </Link>
        </li>
      ))}
    </ol>
  );
}

function Panel({ icon: Icon, title, text, children }: { icon: typeof IconTag; title: string; text: string; children: React.ReactNode }) {
  return (
    <section className={c.panel}>
      <header><span><Icon size={16} /></span><div><h3>{title}</h3><p>{text}</p></div></header>
      {children}
    </section>
  );
}

// ── Section ─────────────────────────────────────────────────────────────────────

export function Insights({ keyId, social: hasSocial, online: hasOnline }: { keyId: string | null; social: boolean; online: boolean }) {
  const both = hasSocial && hasOnline;
  const [view, setView] = useState<View>(both ? "all" : hasSocial ? "social" : "online");
  const [period, setPeriod] = useState<InsightPeriod>(7);
  const url = (t: MediaType) => `/api/admin/stats/insights?type=${t}&days=${period}${keyId ? `&key=${encodeURIComponent(keyId)}` : ""}`;
  // Both types are always fetched (the 7-day ones are kept warm on the server), so switching the view is instant.
  const social = useApi<Response>(hasSocial ? url("social") : null);
  const online = useApi<Response>(hasOnline ? url("online") : null);

  const wanted: MediaType[] = view === "all" ? (["social", "online"] as const).filter((t) => (t === "social" ? hasSocial : hasOnline)) : [view];
  const sources = { social, online };
  const ready = wanted.every((t) => !sources[t].loading && sources[t].data);
  const data = ready
    ? viewData(wanted.flatMap((t) => { const d = sources[t].data?.insights; return d?.pulse ? [[t, d] as [MediaType, InsightsData]] : []; }))
    : null;
  const error = wanted.map((t) => sources[t].error).find(Boolean);
  const from = dayjs().subtract(period - 1, "day").format("YYYY-MM-DD");
  const href = (row: Row, params: Record<string, string>) => mediaHref(row.t, keyId, { from, ...params });
  const title = view === "all" ? "semua media" : MEDIA_TYPE_LABEL[view];

  return (
    <section className={c.section}>
      <header className={c.head}>
        <div>
          <h2>Analisis periode</h2>
          <p>Tren opini, perbandingan, dan topik dibanding {period} hari sebelumnya{data && <> · diperbarui {dayjs(data.at).format("HH:mm")}</>}</p>
        </div>
        <div className={c.controls}>
          {both && (
            <SegmentedControl size="xs" radius="xl" value={view} onChange={(v) => setView(v as View)} aria-label="Jenis media"
              data={(["all", "social", "online"] as const).map((v) => {
                const Icon = VIEW_ICON[v];
                return { value: v, label: <span className={c.segLabel}><Icon size={14} />{v === "all" ? "Semua" : MEDIA_TYPE_LABEL[v]}</span> };
              })} />
          )}
          <SegmentedControl size="xs" radius="xl" value={String(period)} onChange={(v) => setPeriod(Number(v) as InsightPeriod)} aria-label="Periode"
            data={INSIGHT_PERIODS.map((p) => ({ value: String(p), label: `${p} hari` }))} />
        </div>
      </header>

      {error && <MantineAlert color="red">{error}</MantineAlert>}

      <EarlyWarning data={data} view={view} keyId={keyId} />

      <div className={c.grid} data-wide-left>
        <Panel icon={IconTrendingUp} title={`Tren opini ${title}`} text={`Negatif, netral, dan positif per hari, ${period} hari terakhir`}>
          {data ? <Trend data={data} /> : <Skeleton h={220} radius="md" />}
        </Panel>
        <Panel icon={IconArrowUpRight} title="Dibanding periode sebelumnya" text={`${period} hari terakhir vs ${period} hari sebelumnya`}>
          {data ? <Compare current={data.current} previous={data.previous} period={period} /> : <Skeleton h={220} radius="md" />}
        </Panel>
      </div>

      <div className={c.grid} data-cols={1 + Number(!!data?.keywords) + Number(!!data?.hashtags || (!data && view !== "online"))}>
        <Panel icon={IconTag} title="Topik teratas" text={view === "all" ? "Kategori terbanyak dari media sosial dan online" : "Kategori terbanyak, dengan perubahan dari periode sebelumnya"}>
          {data ? <RankedList items={data.categories} label={topicLabel} href={(r) => href(r, { category: r.value })} /> : <Skeleton h={260} radius="md" />}
        </Panel>
        {data?.keywords && (
          <Panel icon={IconBolt} title="Keyword proyek" text="Jumlah penyebutan tiap keyword dan porsi negatifnya">
            <RankedList items={data.keywords} label={(v) => v} href={(r) => href(r, { q: r.value })} showNeg />
          </Panel>
        )}
        {(data?.hashtags || (!data && view !== "online")) && (
          <Panel icon={IconHash} title="Tagar teratas" text="Media sosial · dari ±4.000 post terbaru tiap periode">
            {data?.hashtags ? <RankedList items={data.hashtags} label={(v) => `#${v}`} href={(r) => href(r, { q: r.value })} /> : <Skeleton h={260} radius="md" />}
          </Panel>
        )}
      </div>
    </section>
  );
}
