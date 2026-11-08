"use client";
// Ringkasan "Analisis periode": early-warning alerts for both media types, then for the chosen type and period the opinion
// trend, this period vs the one before, top topics, the project's keywords and hashtags. Loads apart from the rest of
// the page because the grouped scans take a few seconds when the cache is cold.
import { useState } from "react";
import Link from "next/link";
import { Alert as MantineAlert, SegmentedControl, Skeleton } from "@mantine/core";
import {
  IconArrowDownRight, IconArrowUpRight, IconBolt, IconCircleCheck, IconFlame, IconHash, IconMessages, IconTag, IconTrendingUp, IconWorldWww,
} from "@tabler/icons-react";
import dayjs from "dayjs";
import "dayjs/locale/id";
import { INSIGHT_PERIODS, type Alert, type InsightPeriod, type Insights as InsightsData, type PeriodTotals, type Ranked } from "@/lib/media/insights";
import { capitalize, formatNumber, humanize, MEDIA_TYPE_LABEL } from "@/lib/media/labels";
import type { MediaType } from "@/lib/media/types";
import { useApi } from "@/lib/useApi";
import c from "./insights.module.css";

type Response = { insights: InsightsData | null };
type Tone = "pos" | "neu" | "neg";

const TONES: { key: Tone; label: string }[] = [
  { key: "neg", label: "Negatif" },
  { key: "neu", label: "Netral" },
  { key: "pos", label: "Positif" },
];
const TYPE_ICON = { social: IconMessages, online: IconWorldWww } as const;

const pct = (n: number, d: number) => (d ? (n / d) * 100 : 0);
const fmtPct = (v: number) => `${v.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;
const topicLabel = (value: string) => capitalize(humanize(value));
const yesterday = () => dayjs().subtract(1, "day").format("YYYY-MM-DD");

/** Link into the media browser, keeping the project being viewed. */
function mediaHref(type: MediaType, keyId: string | null, params: Record<string, string>) {
  const q = new URLSearchParams(params);
  if (keyId) q.set("key", keyId);
  return `/media/${type}?${q}`;
}

// ── Alerts ──────────────────────────────────────────────────────────────────────

function AlertCard({ type, alert, data, keyId }: { type: MediaType; alert: Alert; data: InsightsData; keyId: string | null }) {
  const media = MEDIA_TYPE_LABEL[type];
  if (alert.kind === "intense") {
    return (
      <Link href={mediaHref(type, keyId, { level: "5", from: yesterday() })} className={c.alert} data-tone="red">
        <span className={c.alertIcon}><IconFlame size={18} /></span>
        <div>
          <b>{formatNumber(alert.n)} post negatif berintensitas sangat tinggi</b>
          <p>{media} · 24 jam terakhir · level emosi 5</p>
          {data.intense.length > 0 && <ul>{data.intense.map((item) => <li key={item.code}>{(item.content ?? item.title ?? "").replace(/\s+/g, " ").slice(0, 110)}</li>)}</ul>}
        </div>
      </Link>
    );
  }
  if (alert.kind === "negative") {
    return (
      <Link href={mediaHref(type, keyId, { from: yesterday() })} className={c.alert} data-tone="orange">
        <span className={c.alertIcon}><IconArrowUpRight size={18} /></span>
        <div>
          <b>Porsi negatif naik ke {fmtPct(alert.share * 100)}</b>
          <p>{media} · 24 jam terakhir, rata-rata 7 hari sebelumnya {fmtPct(alert.avgShare * 100)}</p>
        </div>
      </Link>
    );
  }
  const ratio = alert.n / Math.max(1, alert.avg);
  const href = alert.source === "keyword" ? mediaHref(type, keyId, { q: alert.label, from: yesterday() }) : mediaHref(type, keyId, { category: alert.label, from: yesterday() });
  return (
    <Link href={href} className={c.alert} data-tone="violet">
      <span className={c.alertIcon}><IconBolt size={18} /></span>
      <div>
        <b>{alert.source === "keyword" ? <>Keyword &ldquo;{alert.label}&rdquo;</> : <>Topik {topicLabel(alert.label)}</>} melonjak {ratio >= 10 ? "lebih dari 10" : ratio.toFixed(1).replace(".", ",")}×</b>
        <p>{media} · {formatNumber(alert.n)} dalam 24 jam, biasanya {formatNumber(alert.avg)} per hari</p>
      </div>
    </Link>
  );
}

function Alerts({ social, online, keyId }: { social: InsightsData | null | undefined; online: InsightsData | null | undefined; keyId: string | null }) {
  const loading = social === undefined || online === undefined;
  const items = [
    ...(social?.alerts ?? []).map((alert) => ({ type: "social" as const, alert, data: social! })),
    ...(online?.alerts ?? []).map((alert) => ({ type: "online" as const, alert, data: online! })),
  ];
  return (
    <section className={c.alerts} aria-label="Peringatan dini">
      <header><IconFlame size={16} /><b>Peringatan dini</b><span>24 jam terakhir dibanding rata-rata 7 hari sebelumnya</span></header>
      {loading ? <div className={c.alertGrid}><Skeleton h={78} radius="lg" /><Skeleton h={78} radius="lg" /></div>
        : items.length ? <div className={c.alertGrid}>{items.map((i, n) => <AlertCard key={n} {...i} keyId={keyId} />)}</div>
        : <div className={c.calm}><IconCircleCheck size={18} />Tidak ada lonjakan topik, kenaikan sentimen negatif, atau post berintensitas sangat tinggi.</div>}
    </section>
  );
}

// ── Charts and lists ────────────────────────────────────────────────────────────

/** 100% stacked bars of opinion per 24-hour window, with the volume under each bar. */
function Trend({ data }: { data: InsightsData }) {
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
          const labelled = p.pos + p.neu + p.neg;
          return (
            <div key={p.day} className={c.bar} tabIndex={0} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
              aria-label={`${dayjs(p.day).locale("id").format("D MMMM")}: ${formatNumber(p.total)} item, negatif ${fmtPct(pct(p.neg, labelled))}, netral ${fmtPct(pct(p.neu, labelled))}, positif ${fmtPct(pct(p.pos, labelled))}`}>
              <div className={c.stack} data-empty={!labelled || undefined}>
                {labelled > 0 && TONES.map((t) => <i key={t.key} data-tone={t.key} style={{ flexGrow: p[t.key] }} />)}
              </div>
              {(!dense || i % 5 === data.trend.length % 5 || i === data.trend.length - 1) && <small>{dayjs(p.day).format("D/M")}</small>}
              {hover === i && (
                <span className={c.tip} data-side={i > data.trend.length / 2 ? "left" : undefined}>
                  <b>{dayjs(p.day).locale("id").format("D MMM")}{i === data.trend.length - 1 ? " · 24 jam terakhir" : ""}</b>
                  <span>{formatNumber(p.total)} item · {formatNumber(labelled)} teranalisis</span>
                  {TONES.map((t) => <span key={t.key}><i data-tone={t.key} />{t.label} <em>{fmtPct(pct(p[t.key], labelled))}</em></span>)}
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
/** Below this previous count a percentage change is noise (5 → 105 is "+2.000%"), so it reads "baru" instead. */
const MIN_BASE = 20;

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

function RankedList({ items, label, href, showNeg }: { items: Ranked[]; label: (v: string) => string; href: (v: string) => string; showNeg?: boolean }) {
  if (!items.length) return <p className={c.empty}>Belum ada data pada periode ini.</p>;
  const max = Math.max(1, ...items.map((i) => i.n));
  return (
    <ol className={c.ranked}>
      {items.map((item, i) => (
        <li key={item.value} style={{ animationDelay: `${i * 40}ms` }}>
          <Link href={href(item.value)}>
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
  const [type, setType] = useState<MediaType>(hasSocial ? "social" : "online");
  const [period, setPeriod] = useState<InsightPeriod>(7);
  const url = (t: MediaType) => `/api/admin/stats/insights?type=${t}&days=${period}${keyId ? `&key=${encodeURIComponent(keyId)}` : ""}`;
  // Alerts always look at both types, so both are fetched; the 7-day ones are kept warm on the server.
  const social = useApi<Response>(hasSocial ? url("social") : null);
  const online = useApi<Response>(hasOnline ? url("online") : null);
  const active = type === "social" ? social : online;
  const data = active.loading ? null : active.data?.insights ?? null;
  const shown = (r: typeof social, has: boolean) => (!has ? null : r.loading || !r.data ? undefined : r.data.insights);
  const href = (params: Record<string, string>) => mediaHref(type, keyId, { from: dayjs().subtract(period - 1, "day").format("YYYY-MM-DD"), ...params });

  return (
    <section className={c.section}>
      <header className={c.head}>
        <div>
          <h2>Analisis periode</h2>
          <p>Tren opini, perbandingan, dan topik dibanding {period} hari sebelumnya{data && <> · diperbarui {dayjs(data.at).format("HH:mm")}</>}</p>
        </div>
        <div className={c.controls}>
          {hasSocial && hasOnline && (
            <SegmentedControl size="xs" radius="xl" value={type} onChange={(v) => setType(v as MediaType)} aria-label="Jenis media"
              data={(["social", "online"] as const).map((t) => { const Icon = TYPE_ICON[t]; return { value: t, label: <span className={c.segLabel}><Icon size={14} />{MEDIA_TYPE_LABEL[t]}</span> }; })} />
          )}
          <SegmentedControl size="xs" radius="xl" value={String(period)} onChange={(v) => setPeriod(Number(v) as InsightPeriod)} aria-label="Periode"
            data={INSIGHT_PERIODS.map((p) => ({ value: String(p), label: `${p} hari` }))} />
        </div>
      </header>

      <Alerts social={shown(social, hasSocial)} online={shown(online, hasOnline)} keyId={keyId} />

      {active.error && <MantineAlert color="red">{active.error}</MantineAlert>}

      <div className={c.grid} data-wide-left>
        <Panel icon={IconTrendingUp} title={`Tren opini ${MEDIA_TYPE_LABEL[type]}`} text={`Negatif, netral, dan positif per hari, ${period} hari terakhir`}>
          {data ? <Trend data={data} /> : <Skeleton h={220} radius="md" />}
        </Panel>
        <Panel icon={IconArrowUpRight} title="Dibanding periode sebelumnya" text={`${period} hari terakhir vs ${period} hari sebelumnya`}>
          {data ? <Compare current={data.current} previous={data.previous} period={period} /> : <Skeleton h={220} radius="md" />}
        </Panel>
      </div>

      <div className={c.grid} data-cols={1 + Number(!!data?.keywords) + Number(!!data?.hashtags || (!data && type === "social"))}>
        <Panel icon={IconTag} title="Topik teratas" text="Kategori AI terbanyak, dengan perubahan dari periode sebelumnya">
          {data ? <RankedList items={data.categories} label={topicLabel} href={(v) => href({ category: v })} /> : <Skeleton h={260} radius="md" />}
        </Panel>
        {data?.keywords && (
          <Panel icon={IconBolt} title="Keyword proyek" text="Jumlah penyebutan tiap keyword dan porsi negatifnya">
            <RankedList items={data.keywords} label={(v) => v} href={(v) => href({ q: v })} showNeg />
          </Panel>
        )}
        {(data?.hashtags || (!data && type === "social")) && (
          <Panel icon={IconHash} title="Tagar teratas" text="Dari ±4.000 post terbaru tiap periode">
            {data?.hashtags ? <RankedList items={data.hashtags} label={(v) => `#${v}`} href={(v) => href({ q: v })} /> : <Skeleton h={260} radius="md" />}
          </Panel>
        )}
      </div>
    </section>
  );
}
