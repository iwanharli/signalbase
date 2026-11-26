"use client";
// Ringkasan analysis for all media, social or online, over 7/14/30 days: the filter and KPI tiles shown in the page
// hero, then an early-warning board (three indicators plus the most intense negative posts), the opinion trend, top
// topics, engagement, top accounts/outlets, the project's keywords and hashtags. Both types are always fetched, so
// "Semua" is merged in the browser. Loads apart from the rest of the page because the grouped scans take a few seconds
// when the cache is cold.
import { useRole } from "../RoleContext";
import { useState } from "react";
import Link from "next/link";
import { Alert as MantineAlert, SegmentedControl, Skeleton, Tooltip } from "@mantine/core";
import {
  IconArrowDownRight, IconArrowRight, IconArrowUpRight, IconBolt, IconChevronRight, IconEdit, IconEye, IconFlame, IconHash, IconHeart, IconLayoutGrid, IconMessageCircle, IconMessages, IconMoodSad, IconNews, IconPlugConnected, IconRepeat, IconUsers,
  IconTag, IconTrendingUp, IconWorldWww,
} from "@tabler/icons-react";
import dayjs from "dayjs";
import "dayjs/locale/id";
import relativeTime from "dayjs/plugin/relativeTime";
import {
  INSIGHT_PERIODS, type Alert, type EngagementMetrics, type InsightPeriod, type Insights as InsightsData, type PeriodTotals, type PlatformEngagement,
  type PulseWindow, type Ranked, type TopAccount, type TopMedia,
} from "@/lib/media/insights";
import { capitalize, formatNumber, humanize, MEDIA_TYPE_LABEL, sourceLabel } from "@/lib/media/labels";
import type { MediaItem, MediaType } from "@/lib/media/types";
import { useApi } from "@/lib/useApi";
import { PlatformMark } from "../media/PlatformIcon";
import { CardHelp, type CardHelpId } from "./CardHelp";
import c from "./insights.module.css";

dayjs.extend(relativeTime);

type Response = { insights: InsightsData | null };
export type View = "all" | MediaType;
type Tone = "pos" | "neu" | "neg";
/** A ranked value tagged with the media type it mostly comes from, so links open the right page. */
type Row = Ranked & { t: MediaType };
type Spike = Extract<Alert, { kind: "spike" }> & { t: MediaType };
/** What the page shows for the chosen view: one type, or both merged. */
export type ViewData = {
  trend: InsightsData["trend"]; current: PeriodTotals; previous: PeriodTotals; at: string;
  categories: Row[]; keywords: Row[] | null; hashtags: Row[] | null;
  now: PulseWindow; avg: PulseWindow; spikes: Spike[]; intense: MediaItem[]; hasSocial: boolean;
  engagement: PlatformEngagement[] | null;
  accounts: TopAccount[] | null; media: TopMedia[] | null;
  /** Online: outlets that carried the news, this period and the one before. */
  outlets: { current: number; previous: number } | null;
};

const TONES: { key: Tone; label: string }[] = [
  { key: "neg", label: "Negatif" },
  { key: "neu", label: "Netral" },
  { key: "pos", label: "Positif" },
];
export const VIEW_LABEL: Record<View, string> = { all: "Semua media", social: MEDIA_TYPE_LABEL.social, online: MEDIA_TYPE_LABEL.online };
const VIEW_ICON = { all: IconLayoutGrid, social: IconMessages, online: IconWorldWww } as const;
const TOP_ROWS = 8;
const segClasses = { root: c.seg, indicator: c.segIndicator, label: c.segText, control: c.segControl };
/** Hashtags come from a sample of recent posts, so their bars start just under the smallest count to show the spread. */
const RELATIVE_FLOOR = 0.85;
/** Below this previous count a percentage change is noise (5 → 105 is "+2.000%"), so it reads "baru" instead. */
const MIN_BASE = 20;
/** Early-warning thresholds (the server applies the same ones to spikes and the negative share). */
const NEGATIVE_SHIFT_POINTS = 8;
const NEGATIVE_MIN_LABELLED = 30;
const INTENSE_RATIO = 1.5;
const INTENSE_MIN = 10;
/** Below the warning thresholds but clearly rising: shown as "Naik" (yellow) instead of a green "Normal". */
const NEGATIVE_WATCH_POINTS = 2;
const INTENSE_WATCH_RATIO = 1.2;

const pct = (n: number, d: number) => (d ? (n / d) * 100 : 0);
const fmtPct = (v: number) => `${v.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;
const topicLabel = (value: string) => capitalize(humanize(value));
const yesterday = () => dayjs().subtract(1, "day").format("YYYY-MM-DD");
const sumWindow = (a: PulseWindow, b: PulseWindow): PulseWindow => ({ total: a.total + b.total, labelled: a.labelled + b.labelled, neg: a.neg + b.neg, hot: a.hot + b.hot });
const sumTotals = (a: PeriodTotals, b: PeriodTotals): PeriodTotals => ({ total: a.total + b.total, labelled: a.labelled + b.labelled, pos: a.pos + b.pos, neg: a.neg + b.neg, hot: (a.hot ?? 0) + (b.hot ?? 0) });

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
      return q ? { ...acc, total: acc.total + q.total, pos: acc.pos + q.pos, neu: acc.neu + q.neu, neg: acc.neg + q.neg, hot: (acc.hot ?? 0) + (q.hot ?? 0) } : acc;
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
    engagement: social?.engagement ?? null,
    accounts: social?.accounts ?? null,
    media: parts.find(([t]) => t === "online")?.[1].media ?? null,
    outlets: parts.find(([t]) => t === "online")?.[1].outlets ?? null,
    hasSocial: !!social,
  };
}

// ── Early warning ───────────────────────────────────────────────────────────────

function Indicator({ icon: Icon, label, value, detail, warn, watch, na, href }: {
  icon: typeof IconFlame; label: string; value: string; detail: React.ReactNode; warn: boolean; watch?: boolean; na?: boolean; href?: string;
}) {
  const body = (
    <>
      <div className={c.indTop}>
        <span className={c.indIcon}><Icon size={17} /></span>
        <span className={c.indLabel}>{label}</span>
        <span className={c.indStatus}>{na ? "Tidak berlaku" : warn ? "Waspada" : watch ? "Naik" : "Normal"}</span>
      </div>
      <b className={c.indValue}>{value}</b>
      <span className={c.indDetail}>{detail}</span>
    </>
  );
  const state = na ? "na" : warn ? "warn" : watch ? "watch" : "ok";
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
  const negWatch = now.labelled >= NEGATIVE_MIN_LABELLED && share - avgShare >= NEGATIVE_WATCH_POINTS;
  const hotWatch = now.hot >= INTENSE_MIN && now.hot >= avg.hot * INTENSE_WATCH_RATIO;
  const anyWarn = negWarn || hotWarn || spikes.length > 0;
  const typeForLinks: MediaType = view === "online" ? "online" : "social";
  const ratio = (s: Spike) => s.n / Math.max(1, s.avg);

  return (
    <section className={c.warning} data-warn={anyWarn || undefined}>
      <header className={c.warningHead}>
        <div><h3>Peringatan dini<CardHelp id="earlyWarning" /></h3><p>24 jam terakhir dibanding rata-rata harian 7 hari sebelumnya · {VIEW_LABEL[view]}</p></div>
        <span className={c.overall} data-warn={anyWarn || undefined}><i />{anyWarn ? "Perlu perhatian" : "Situasi normal"}</span>
      </header>

      <div className={c.indicators}>
        <Indicator icon={IconFlame} label="Intensitas sangat tinggi" na={!data.hasSocial} warn={hotWarn} watch={hotWatch}
          href={mediaHref("social", keyId, { level: "5", from: yesterday() })}
          value={data.hasSocial ? formatNumber(now.hot) : "—"}
          detail={data.hasSocial ? <>post negatif level 5 · biasanya {formatNumber(avg.hot)}/hari</> : "Hanya untuk media sosial"} />
        <Indicator icon={IconMoodSad} label="Porsi negatif" warn={negWarn} watch={negWatch}
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
        {labelled > 0 && (
          <span className={c.avgLine} style={{ ["--s" as string]: share.neg / 100 }} aria-hidden>
            <em>rata-rata negatif {fmtPct(share.neg)}</em>
          </span>
        )}
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
      <p className={c.note}>Porsi dari item yang sudah dianalisis AI, per 24 jam. Garis putus-putus: rata-rata negatif periode ini. Arahkan kursor ke batang untuk detail.</p>
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

/** Tiny area chart for a KPI tile; the shape only, the scale is the tile's own range. */
function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(...values), min = Math.min(...values), span = max - min || 1;
  const line = values.map((v, i) => `${i ? "L" : "M"}${((i / (values.length - 1)) * 100).toFixed(1)} ${(26 - ((v - min) / span) * 22).toFixed(1)}`).join(" ");
  return (
    <svg className={c.spark} viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden>
      <path d={`${line} L100 30 L0 30 Z`} className={c.sparkArea} />
      <path d={line} className={c.sparkLine} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Likes, comments and shares over all platforms (a metric a platform doesn't record counts as 0). */
const totalInteractions = (rows: PlatformEngagement[], side: "current" | "previous") => rows.reduce((t, r) => t + interactions(r[side]), 0);
const signedPoints = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("id-ID", { maximumFractionDigits: 1 })}`;

/** The four headline numbers of the chosen view and period: volume, net sentiment, intense negative posts (news: negative
 *  articles) and interactions (news: outlets), each with its change and, where there is a daily series, a sparkline. */
export function Kpis({ data, period, keyId, view }: { data: ViewData | null; period: number; keyId: string | null; view: View }) {
  if (!data) return <div className={c.kpis}>{[0, 1, 2, 3].map((i) => <div key={i} className={c.kpi} data-loading />)}</div>;
  const { current: now, previous: before, trend } = data;
  const share = (p: { pos: number; neu: number; neg: number }, k: "pos" | "neg") => pct(p[k], p.pos + p.neu + p.neg);
  const from = dayjs().subtract(period - 1, "day").format("YYYY-MM-DD");
  const type: MediaType = view === "online" ? "online" : "social";
  const social = view !== "online" && data.hasSocial;
  /** Positive share minus negative share, in percentage points. */
  const net = (t: PeriodTotals) => pct(t.pos, t.labelled) - pct(t.neg, t.labelled);
  const tiles = [
    { key: "vol", help: "volume" as CardHelpId, label: "Volume", value: formatNumber(now.total), delta: <Delta now={now.total} before={before.total} />,
      sub: `sebelumnya ${formatNumber(before.total)}`, spark: trend.map((p) => p.total), href: view === "all" ? null : mediaHref(type, keyId, { from }) },
    { key: "net", help: "netSentiment" as CardHelpId, label: "Sentimen bersih", value: `${signedPoints(net(now))} poin`, delta: <Delta now={net(now)} before={net(before)} points goodWhenUp />,
      sub: `negatif ${fmtPct(pct(now.neg, now.labelled))} · positif ${fmtPct(pct(now.pos, now.labelled))}`, spark: trend.map((p) => share(p, "pos") - share(p, "neg")), href: null, tone: net(now) < 0 ? "bad" : "good" },
    social
      ? { key: "hot", help: "intenseNeg" as CardHelpId, label: "Post negatif intens", value: formatNumber(now.hot ?? 0), delta: <Delta now={now.hot ?? 0} before={before.hot ?? 0} goodWhenUp={false} />,
          sub: `sebelumnya ${formatNumber(before.hot ?? 0)} · intensitas 5/5`, spark: trend.map((p) => p.hot ?? 0), href: mediaHref("social", keyId, { from, level: "5" }) }
      : { key: "hot", help: "negArticles" as CardHelpId, label: "Berita negatif", value: formatNumber(now.neg), delta: <Delta now={now.neg} before={before.neg} goodWhenUp={false} />,
          sub: `sebelumnya ${formatNumber(before.neg)}`, spark: trend.map((p) => p.neg), href: null },
    social && data.engagement
      ? { key: "eng", help: "interactions" as CardHelpId, label: "Interaksi", value: short(totalInteractions(data.engagement, "current")), delta: <Delta now={totalInteractions(data.engagement, "current")} before={totalInteractions(data.engagement, "previous")} goodWhenUp />,
          sub: `like, komentar, share · sebelumnya ${short(totalInteractions(data.engagement, "previous"))}`, spark: null, href: null }
      : { key: "eng", help: "outletCount" as CardHelpId, label: "Media yang memberitakan", value: formatNumber(data.outlets?.current ?? 0), delta: <Delta now={data.outlets?.current ?? 0} before={data.outlets?.previous ?? 0} goodWhenUp={false} />,
          sub: `portal berita · sebelumnya ${formatNumber(data.outlets?.previous ?? 0)}`, spark: null, href: null },
  ];
  return (
    <div className={c.kpis} data-count={tiles.length}>
      {tiles.map((t, i) => {
        const body = (
          <>
            <span className={c.kpiLabel}>{t.label}<CardHelp id={t.help} /></span>
            <b className={c.kpiValue}>{t.value}{t.delta}</b>
            <span className={c.kpiSub}>{t.sub}</span>
            {t.spark && <Spark values={t.spark} />}
          </>
        );
        return t.href
          ? <Link key={t.key} href={t.href} className={c.kpi} data-kpi={t.key} data-tone={"tone" in t ? t.tone : undefined} style={{ animationDelay: `${i * 60}ms` }}>{body}</Link>
          : <div key={t.key} className={c.kpi} data-kpi={t.key} data-tone={"tone" in t ? t.tone : undefined} style={{ animationDelay: `${i * 60}ms` }}>{body}</div>;
      })}
    </div>
  );
}

/** Media and period switches; `glass` styles them for the dark hero and the sticky bar. */
export function FilterControls({ view, onView, period, onPeriod, both }: {
  view: View; onView: (v: View) => void; period: InsightPeriod; onPeriod: (p: InsightPeriod) => void; both: boolean;
}) {
  return (
    <div className={c.controls}>
      {both && (
        <SegmentedControl classNames={segClasses} value={view} onChange={(v) => onView(v as View)} aria-label="Jenis media"
          data={(["all", "social", "online"] as const).map((v) => {
            const Icon = VIEW_ICON[v];
            return { value: v, label: <span className={c.segLabel}><Icon size={15} />{v === "all" ? "Semua" : MEDIA_TYPE_LABEL[v]}</span> };
          })} />
      )}
      <SegmentedControl classNames={segClasses} value={String(period)} onChange={(v) => onPeriod(Number(v) as InsightPeriod)} aria-label="Periode"
        data={INSIGHT_PERIODS.map((p) => ({ value: String(p), label: `${p} hari` }))} />
    </div>
  );
}

function RankedList({ items, label, href, showNeg, relative, noDelta, cols }: {
  items: Row[]; label: (v: string) => string; href: (row: Row) => string; showNeg?: boolean; relative?: boolean; noDelta?: boolean; cols?: 2;
}) {
  if (!items.length) return <p className={c.empty}>Belum ada data pada periode ini.</p>;
  const max = Math.max(1, ...items.map((i) => i.n));
  const floor = relative ? Math.min(...items.map((i) => i.n)) * RELATIVE_FLOOR : 0;
  return (
    <ol className={c.ranked} data-cols={cols}>
      {items.map((item, i) => (
        <li key={item.value} style={{ animationDelay: `${i * 40}ms` }}>
          <Link href={href(item)}>
            <span className={c.rankLabel}>{label(item.value)}</span>
            <span className={c.rankValue}>{formatNumber(item.n)}{!noDelta && <Delta now={item.n} before={item.prev} />}</span>
            <span className={c.rankBar}><i style={{ width: `${((item.n - floor) / Math.max(1, max - floor)) * 100}%` }} /></span>
            {showNeg && item.neg !== undefined && <span className={c.rankNeg}>{fmtPct(pct(item.neg, item.n))} negatif</span>}
          </Link>
        </li>
      ))}
    </ol>
  );
}

const METRICS: { key: keyof EngagementMetrics; label: string; icon: typeof IconHeart }[] = [
  { key: "likes", label: "Like", icon: IconHeart },
  { key: "comments", label: "Komentar", icon: IconMessageCircle },
  { key: "shares", label: "Share / repost", icon: IconRepeat },
];

/** One fixed colour per platform, so a platform keeps its colour in every bar and card. */
const PLATFORM_COLOR: Record<string, string> = {
  instagram: "#d6249f", tiktok: "#0891b2", threads: "#7c3aed", facebook: "#1877f2", twitter: "#64748b", youtube: "#e11d48",
};
const platformColor = (source: string) => PLATFORM_COLOR[source] ?? "#94a3b8";
const compact = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });
const short = (n: number) => (n < 10_000 ? formatNumber(n) : compact.format(n));
const interactions = (m: EngagementMetrics) => (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0);

/** One row per platform: posts, interactions per post (the fair way to compare platforms of very different sizes) and
 *  each metric; the footer holds the totals and their change from the previous period. */
function Engagement({ rows, href }: { rows: PlatformEngagement[]; href: (source: string) => string }) {
  if (!rows.length) return <p className={c.empty}>Belum ada post media sosial pada periode ini.</p>;
  const recorded = (r: PlatformEngagement) => METRICS.some((m) => r.current[m.key] !== null);
  const perPost = (r: PlatformEngagement) => (recorded(r) ? interactions(r.current) / Math.max(1, r.posts) : null);
  const sorted = [...rows].sort((a, b) => interactions(b.current) - interactions(a.current) || (b.current.views ?? 0) - (a.current.views ?? 0));
  const best = Math.max(1, ...sorted.map((r) => perPost(r) ?? 0));
  const total = (key: keyof EngagementMetrics, side: "current" | "previous") => rows.reduce((t, r) => t + (r[side][key] ?? 0), 0);
  const cell = (v: number | null, source: string, label: string) =>
    v === null ? <span className={c.engOff} title={`${sourceLabel(source)} tidak mencatat ${label.toLowerCase()}`}>—</span> : <span title={formatNumber(v)}>{short(v)}</span>;

  return (
    <div className={c.engagement}>
      <div className={c.engScroll}>
        <table className={c.engTable}>
          <thead>
            <tr>
              <th>Platform</th><th>Post</th><th>Interaksi per post</th>
              {METRICS.map((m) => <th key={m.key}><m.icon size={13} />{m.label}</th>)}
              <th><IconEye size={13} />Penayangan</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const per = perPost(r);
              return (
                <tr key={r.source} style={{ ["--p" as string]: platformColor(r.source) }}>
                  <td><Link href={href(r.source)} className={c.engName}><span className={c.engMark}><PlatformMark source={r.source} size={15} /></span>{sourceLabel(r.source)}</Link></td>
                  <td>{formatNumber(r.posts)}</td>
                  <td>
                    <span className={c.engPer}>
                      <b title={per === null ? undefined : formatNumber(per)}>{per === null ? "—" : short(Math.round(per))}</b>
                      <i>{per !== null && <s style={{ width: `${(per / best) * 100}%` }} />}</i>
                    </span>
                  </td>
                  {METRICS.map((m) => <td key={m.key}>{cell(r.current[m.key], r.source, m.label)}</td>)}
                  <td>{cell(r.current.views, r.source, "penayangan")}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th>Total</th>
              <td>{formatNumber(rows.reduce((t, r) => t + r.posts, 0))}</td>
              <td />
              {[...METRICS.map((m) => m.key), "views" as const].map((k) => (
                <td key={k}><b>{short(total(k, "current"))}</b><Delta now={total(k, "current")} before={total(k, "previous")} /></td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className={c.note}>Angka dicatat saat post diambil, jadi menggambarkan engagement awal, bukan total akhir. Interaksi = like + komentar + share; “—” berarti platform tidak mencatatnya. Perubahan di baris total dibanding periode sebelumnya.</p>
    </div>
  );
}

/** Share of negative among labelled items as a chip whose colour follows severity (high ≥ 50%, medium ≥ 25%). */
function NegShare({ neg, labelled }: { neg: number; labelled: number }) {
  if (!labelled) return <span className={c.topNeg} data-level="none">belum dianalisis</span>;
  const share = pct(neg, labelled);
  const level = share >= 50 ? "high" : share >= 25 ? "mid" : "low";
  return (
    <span className={c.topNeg} data-level={level} title={`${formatNumber(neg)} dari ${formatNumber(labelled)} item teranalisis bernada negatif`}>
      {Math.round(share)}% negatif
    </span>
  );
}

/** Ranked accounts or outlets in equal-height rows: rank, mark, name with a thin volume bar, count with change, negative chip. */
function TopList<T extends { n: number; prev: number; labelled: number; neg: number }>({ rows, empty, render }: {
  rows: T[]; empty: string;
  render: (row: T) => { key: string; name: React.ReactNode; sub?: React.ReactNode; href: string | null; external?: boolean; mark: React.ReactNode };
}) {
  if (!rows.length) return <p className={c.empty}>{empty}</p>;
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <ol className={c.top}>
      {rows.map((row, i) => {
        const r = render(row);
        const body = (
          <>
            <span className={c.topRank}>{i + 1}</span>
            <span className={c.topMark}>{r.mark}</span>
            <span className={c.topName}>
              <b>{r.name}</b>
              <small>{r.sub}</small>
              <span className={c.topBar}><i style={{ width: `${(row.n / max) * 100}%` }} /></span>
            </span>
            <span className={c.topCount}><b>{formatNumber(row.n)}</b><Delta now={row.n} before={row.prev} /></span>
            <NegShare neg={row.neg} labelled={row.labelled} />
          </>
        );
        return (
          <li key={r.key}>
            {r.href ? (r.external
              ? <a href={r.href} target="_blank" rel="noopener noreferrer" className={c.topRow}>{body}</a>
              : <Link href={r.href} className={c.topRow}>{body}</Link>)
              : <div className={c.topRow}>{body}</div>}
          </li>
        );
      })}
    </ol>
  );
}

/** `action` sits at the right of the header (e.g. tabs). */
function Panel({ icon: Icon, title, text, help, action, children }: { icon: typeof IconTag; title: string; text: string; help: CardHelpId; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className={c.panel}>
      <header><span><Icon size={16} /></span><div><h3>{title}<CardHelp id={help} /></h3><p>{text}</p></div>{action && <div className={c.panelAction}>{action}</div>}</header>
      {children}
    </section>
  );
}

const ALL_PLATFORMS = "all";

/** Most active accounts, overall or per platform (icon tabs in the header). The server sends the top 10 overall plus
 *  the top 10 of each platform, so switching tabs needs no new request. */
function TopAccounts({ accounts, period }: { accounts: TopAccount[] | null; period: number }) {
  const [platform, setPlatform] = useState(ALL_PLATFORMS);
  // Platforms in order of how much their accounts post, so the busiest tab comes first.
  const volume = new Map<string, number>();
  for (const a of accounts ?? []) volume.set(a.source, (volume.get(a.source) ?? 0) + a.n);
  const platforms = [...volume.keys()].sort((a, b) => volume.get(b)! - volume.get(a)!);
  const active = platforms.includes(platform) ? platform : ALL_PLATFORMS;
  const rows = (accounts ?? []).filter((a) => active === ALL_PLATFORMS || a.source === active).slice(0, 10);

  const tabs = platforms.length > 1 && (
    <div className={c.iconTabs} role="tablist" aria-label="Platform">
      {[ALL_PLATFORMS, ...platforms].map((p) => (
        <Tooltip key={p} label={p === ALL_PLATFORMS ? "Semua platform" : sourceLabel(p)} withArrow openDelay={200}>
          <button type="button" role="tab" aria-selected={active === p} aria-label={p === ALL_PLATFORMS ? "Semua platform" : sourceLabel(p)}
            data-active={active === p || undefined} onClick={() => setPlatform(p)}>
            {p === ALL_PLATFORMS ? <IconLayoutGrid size={15} /> : <PlatformMark source={p} size={15} />}
          </button>
        </Tooltip>
      ))}
    </div>
  );

  return (
    <Panel icon={IconUsers} title="10 akun teratas" help="accounts" action={tabs}
      text={`${active === ALL_PLATFORMS ? "Akun media sosial" : `Akun ${sourceLabel(active)}`} dengan post terbanyak, ${period} hari terakhir`}>
      {accounts ? (
        <TopList rows={rows} empty="Belum ada akun pada periode ini."
          render={(a) => ({
            key: `${a.source}:${a.username}`,
            mark: <PlatformMark source={a.source} size={16} />,
            name: a.name && a.name !== a.username ? a.name : `@${a.username}`,
            sub: <>{a.name && a.name !== a.username ? `@${a.username} · ` : ""}{sourceLabel(a.source)}{a.likes > 0 && ` · ${formatNumber(a.likes)} like`}</>,
            href: a.profileUrl, external: true,
          })} />
      ) : <Skeleton h={420} radius="md" />}
    </Panel>
  );
}

// ── Project & keywords ──────────────────────────────────────────────────────────

export type ProjectSummary = { id: string; name: string; keywords: string[]; lastUsedAt: string | null };

/** Insights of another project, loaded only when its group is opened (cached on the server like the viewed one). */
function useProjectData(projectId: string, types: MediaType[], period: InsightPeriod, enabled: boolean): ViewData | null | undefined {
  const url = (t: MediaType) => (enabled && types.includes(t) ? `/api/admin/stats/insights?type=${t}&days=${period}&key=${encodeURIComponent(projectId)}` : null);
  const social = useApi<Response>(url("social"));
  const online = useApi<Response>(url("online"));
  if (!enabled) return undefined;
  const sources = { social, online };
  if (types.some((t) => sources[t].loading || (!sources[t].data && !sources[t].error))) return undefined;
  return viewData(types.flatMap((t) => { const d = sources[t].data?.insights; return d?.pulse ? [[t, d] as [MediaType, InsightsData]] : []; }));
}

/** One project: a header with its volume, change and negative share, and (when open) how each keyword did. */
function ProjectGroup({ project, viewed, data, open, onToggle, keywordHref }: {
  project: ProjectSummary; viewed: boolean; data: ViewData | null | undefined; open: boolean; onToggle: () => void; keywordHref: (row: Row) => string;
}) {
  const admin = useRole() === "admin"; // only admins change a project's keywords
  const share = data ? pct(data.current.neg, data.current.labelled) : 0;
  const level = share >= 50 ? "high" : share >= 25 ? "mid" : "low";
  return (
    <div className={c.group} data-open={open || undefined} data-viewed={viewed || undefined}>
      <button type="button" className={c.groupHead} onClick={onToggle} aria-expanded={open}>
        <IconChevronRight size={15} className={c.groupChevron} />
        <span className={c.groupName}>
          <b>{project.name}</b>
          <small>{viewed ? "sedang dilihat · " : ""}{project.keywords.length ? `${project.keywords.length} keyword` : "semua data"}</small>
        </span>
        {data ? <>
          <span className={c.groupTotal}><b>{short(data.current.total)}</b><Delta now={data.current.total} before={data.previous.total} /></span>
          {data.current.labelled > 0 && <span className={c.topNeg} data-level={level}>{Math.round(share)}% negatif</span>}
        </> : open && <span className={c.groupLoading}>memuat…</span>}
      </button>

      {open && (
        <div className={c.groupBody}>
          {data === undefined ? <Skeleton h={90} radius="md" /> : !data ? <p className={c.empty}>Belum ada data untuk proyek ini.</p> : data.keywords ? (
            <RankedList items={data.keywords} label={(v) => v} href={keywordHref} showNeg />
          ) : (
            // One keyword is the project's whole volume, so it gets its chip instead of a ranking.
            <div className={c.kwChips}>{project.keywords.length ? project.keywords.map((k) => <span key={k}>{k}</span>) : <span>semua data</span>}</div>
          )}
          <div className={c.groupLinks}>
            {!viewed && <Link href={`/dashboard?key=${project.id}`}>Lihat Ringkasan proyek <IconArrowRight size={12} /></Link>}
            {admin && <Link href={`/project/${project.id}?tab=keywords`}><IconEdit size={12} />Ubah keyword</Link>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Keywords grouped per project: the viewed project first and open, the account's other projects folded below. */
function ProjectCard({ project, others, data, types, period, from }: {
  project: ProjectSummary; others: ProjectSummary[]; data: ViewData | null; types: MediaType[]; period: InsightPeriod; from: string;
}) {
  const admin = useRole() === "admin";
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set([project.id]));
  const toggle = (id: string) => setOpenIds((s) => { const next = new Set(s); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const hrefFor = (projectId: string) => (row: Row) => mediaHref(row.t, projectId, { from, q: row.value });
  return (
    <section className={c.panel}>
      <header className={c.projectHead}>
        <span><IconPlugConnected size={16} /></span>
        <div><h3>Keyword per proyek<CardHelp id="projectKeywords" /></h3><p>Penyebutan dan porsi negatif, {period} hari terakhir</p></div>
        {admin && <Link href="/project" className={c.projectEdit}>Kelola</Link>}
      </header>
      <div className={c.groups}>
        <ProjectGroup project={project} viewed data={data ?? undefined} open={openIds.has(project.id)} onToggle={() => toggle(project.id)} keywordHref={hrefFor(project.id)} />
        {others.map((p) => (
          <OtherProject key={p.id} project={p} types={types} period={period} open={openIds.has(p.id)} onToggle={() => toggle(p.id)} keywordHref={hrefFor(p.id)} />
        ))}
      </div>
    </section>
  );
}

/** A folded project fetches its numbers the first time it is opened, and keeps them while the period stays the same. */
function OtherProject({ project, types, period, open, onToggle, keywordHref }: {
  project: ProjectSummary; types: MediaType[]; period: InsightPeriod; open: boolean; onToggle: () => void; keywordHref: (row: Row) => string;
}) {
  const [loaded, setLoaded] = useState(open);
  if (open && !loaded) setLoaded(true);
  const data = useProjectData(project.id, types, period, loaded);
  return <ProjectGroup project={project} viewed={false} data={data} open={open} onToggle={onToggle} keywordHref={keywordHref} />;
}

// ── Section ─────────────────────────────────────────────────────────────────────

/** Insights of the chosen view and period. Both types are always fetched (the 7-day ones are kept warm on the server),
 *  so switching the view is instant. `hasSocial`/`hasOnline` are false until the scope is known. */
export function useInsights(keyId: string | null, hasSocial: boolean, hasOnline: boolean, view: View, period: InsightPeriod) {
  const url = (t: MediaType) => `/api/admin/stats/insights?type=${t}&days=${period}${keyId ? `&key=${encodeURIComponent(keyId)}` : ""}`;
  const social = useApi<Response>(hasSocial ? url("social") : null);
  const online = useApi<Response>(hasOnline ? url("online") : null);
  const wanted: MediaType[] = view === "all" ? (["social", "online"] as const).filter((t) => (t === "social" ? hasSocial : hasOnline)) : [view];
  const sources = { social, online };
  const ready = wanted.length > 0 && wanted.every((t) => !sources[t].loading && sources[t].data);
  const data = ready
    ? viewData(wanted.flatMap((t) => { const d = sources[t].data?.insights; return d?.pulse ? [[t, d] as [MediaType, InsightsData]] : []; }))
    : null;
  return { data, error: wanted.map((t) => sources[t].error).find(Boolean), wanted };
}

export function Insights({ keyId, view, period, data, error, wanted, projects = [], latest }: {
  keyId: string | null; view: View; period: InsightPeriod; data: ViewData | null; error?: string | null; wanted: MediaType[]; projects?: ProjectSummary[];
  /** The latest posts and articles, placed right after trend and topics (what a reader checks first). */
  latest?: React.ReactNode;
}) {
  const staff = useRole() !== "user";
  // Clients read their keywords in the hero's "Keyword terdaftar" pill; the per-project card is for staff.
  const project = keyId && staff ? projects.find((p) => p.id === keyId) ?? null : null;
  const from = dayjs().subtract(period - 1, "day").format("YYYY-MM-DD");
  const href = (row: Row, params: Record<string, string>) => mediaHref(row.t, keyId, { from, ...params });
  const title = view === "all" ? "semua media" : MEDIA_TYPE_LABEL[view];
  const showTags = !!data?.hashtags || (!data && view !== "online");
  return (
    <section className={c.section}>
      {error && <MantineAlert color="red">{error}</MantineAlert>}

      <EarlyWarning data={data} view={view} keyId={keyId} />

      <div className={c.grid} data-wide-left>
        <Panel icon={IconTrendingUp} title={`Tren opini ${title}`} help="trend" text={`Negatif, netral, dan positif per hari, ${period} hari terakhir`}>
          {data ? <Trend data={data} /> : <Skeleton h={220} radius="md" />}
        </Panel>
        <Panel icon={IconTag} title="Topik teratas" help="topics" text={`Kategori terbanyak, dibanding ${period} hari sebelumnya`}>
          {data ? <RankedList items={data.categories} label={topicLabel} href={(r) => href(r, { category: r.value })} /> : <Skeleton h={260} radius="md" />}
        </Panel>
      </div>

      {latest}

      <div className={c.grid} data-cols={view === "all" ? 2 : 1}>
        {view !== "online" && (
          <TopAccounts accounts={data ? data.accounts ?? [] : null} period={period} />
        )}
        {view !== "social" && (
          <Panel icon={IconNews} title="10 media teratas" help="outlets" text={`Media online dengan berita terbanyak, ${period} hari terakhir`}>
            {data ? (
              <TopList rows={data.media ?? []} empty="Belum ada berita pada periode ini."
                render={(m) => ({
                  key: m.source,
                  mark: <IconWorldWww size={16} />,
                  name: sourceLabel(m.source),
                  sub: `${formatNumber(m.labelled)} berita dianalisis AI`,
                  href: mediaHref("online", keyId, { source: m.source, from }),
                })} />
            ) : <Skeleton h={420} radius="md" />}
          </Panel>
        )}
      </div>

      {(project || showTags) && (
        <div className={c.grid} data-cols={project && showTags ? 2 : 1}>
          {project && (
            <ProjectCard project={project} others={projects.filter((p) => p.id !== project.id)} data={data} types={wanted} period={period} from={from} />
          )}
          {showTags && (
            <Panel icon={IconHash} title="Tagar teratas" help="hashtags" text="Media sosial · dari ±4.000 post terbaru tiap periode">
              {data?.hashtags ? <RankedList items={data.hashtags} label={(v) => `#${v}`} href={(r) => href(r, { q: r.value })} relative noDelta cols={project ? undefined : 2} />
                : <Skeleton h={260} radius="md" />}
            </Panel>
          )}
        </div>
      )}

      {view !== "online" && (
        <Panel icon={IconHeart} title="Engagement per platform" help="engagement" text={`Like, komentar, share, dan penayangan media sosial, ${period} hari terakhir`}>
          {data ? (data.engagement ? <Engagement rows={data.engagement} href={(source) => mediaHref("social", keyId, { source, from })} /> : <p className={c.empty}>Tidak ada data media sosial dalam cakupan ini.</p>)
            : <Skeleton h={260} radius="md" />}
        </Panel>
      )}
    </section>
  );
}
