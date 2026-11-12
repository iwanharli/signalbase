"use client";
// Executive report as A4 pages for the browser's print dialog ("Simpan sebagai PDF"). Opened from Ringkasan with
// ?days=&key=&untuk=&sifat=; prints itself once the data is in.
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import dayjs from "dayjs";
import { IconAlertTriangle, IconBulb, IconNews, IconSpeakerphone, IconUsers } from "@tabler/icons-react";
import "dayjs/locale/id";
import { LogoMark } from "../Logo";
import type { Insights, PeriodTotals, TrendPoint } from "@/lib/media/insights";
import { capitalize, formatNumber, MEDIA_TYPE_LABEL, sourceLabel } from "@/lib/media/labels";
import { moodColorVar, moodInfo } from "@/lib/media/mood";
import type { MediaItem, MediaType, MoodCount } from "@/lib/media/types";
import type { IssueSummary } from "@/lib/issues";
import { formatWindow, levelColor, type OntIssue } from "@/lib/ontologi";
import { changePct, closingNarrative, DEFAULT_SIFAT, entityRanking, issueHeat, locationRanking, narrative, reportFileName, reportTitle, type ReportData, type ReportSection } from "@/lib/report";
import { useApi } from "@/lib/useApi";
import r from "./report.module.css";

// Decorative network on the cover: [x, y, radius] nodes and the pairs joined by a line.
const NODES: [number, number, number][] = [[105, 52, 3], [70, 40, 1.6], [140, 38, 1.8], [40, 62, 1.4], [170, 66, 1.6], [90, 80, 1.5], [125, 84, 1.7], [20, 30, 1.2], [190, 28, 1.2], [60, 96, 1.3], [155, 100, 1.3], [105, 18, 1.4]];
const NET: [number, number][] = [[0, 1], [0, 2], [0, 5], [0, 6], [0, 11], [1, 3], [1, 7], [1, 11], [2, 4], [2, 8], [2, 11], [3, 5], [3, 9], [4, 6], [4, 10], [5, 9], [6, 10], [5, 6]];

function Net({ id }: { id: string }) {
  return (
    <svg className={r.net} viewBox="0 0 210 130" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs><radialGradient id={id}><stop offset="0" stopColor="#38bdf8" stopOpacity=".55" /><stop offset="1" stopColor="#38bdf8" stopOpacity="0" /></radialGradient></defs>
      <circle cx="105" cy="52" r="46" fill={`url(#${id})`} />
      {NET.map(([a, b], k) => <line key={k} x1={NODES[a][0]} y1={NODES[a][1]} x2={NODES[b][0]} y2={NODES[b][1]} stroke="#38bdf8" strokeOpacity=".35" strokeWidth=".3" />)}
      {NODES.map(([x, y, z], k) => <circle key={k} cx={x} cy={y} r={z} fill="#7dd3fc" fillOpacity=".85" />)}
    </svg>
  );
}

const fmtDate = (d: dayjs.Dayjs) => d.locale("id").format("D MMMM YYYY");
const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : "—");
const delta = (now: number, before: number) => { const p = changePct(now, before); return p === null ? "baru" : `${p > 0 ? "+" : ""}${p}%`; };

function Page({ children, n, total, sifat }: { children: React.ReactNode; n: number; total: number; sifat: string }) {
  return (
    <section className={r.page} data-report-page>
      <header className={r.pageHead}><span className={r.sifatTag}>SIFAT: {sifat}</span></header>
      <div className={r.body}>{children}</div>
      <footer className={r.pageFoot}><span>Laporan Eksekutif Intelijen Isu Publik</span><span>{n} / {total}</span></footer>
    </section>
  );
}

const H = ({ children, sub }: { children: React.ReactNode; sub?: string }) => <div className={r.h}><h2>{children}</h2>{sub && <p>{sub}</p>}</div>;

const SEG = { neg: "#e11d48", neu: "#94a3b8", pos: "#16a34a", rest: "#e2e8f0" };

/** Stacked daily bars with grid, y-axis and totals. One or two days are too few for a trend, so those compare with the period before instead. */
function TrendChart({ trend, current, previous }: { trend: TrendPoint[]; current: PeriodTotals; previous: PeriodTotals }) {
  if (trend.length < 3) return <Compare current={current} previous={previous} />;
  const max = Math.max(1, ...trend.map((t) => t.total));
  const L = 34, W = 700, Ht = 150, gap = 6, bw = Math.min(46, (W - L - gap * trend.length) / trend.length);
  const step = (W - L) / trend.length;
  const seg = (t: TrendPoint) => [[SEG.neg, t.neg], [SEG.neu, t.neu], [SEG.pos, t.pos], [SEG.rest, Math.max(0, t.total - t.neg - t.neu - t.pos)]] as const;
  return (
    <svg viewBox={`0 0 ${W} ${Ht + 30}`} className={r.chart} role="img" aria-label="Volume harian">
      {[0, 0.5, 1].map((f) => <g key={f}><line x1={L} x2={W} y1={20 + (1 - f) * Ht} y2={20 + (1 - f) * Ht} stroke="#e2e8f0" strokeDasharray={f ? "3 3" : undefined} /><text x={L - 6} y={24 + (1 - f) * Ht} textAnchor="end" fontSize="9" fill="#94a3b8">{formatNumber(max * f)}</text></g>)}
      {trend.map((t, i) => {
        let y = 20 + Ht;
        const x = L + i * step + (step - bw) / 2;
        return (
          <g key={t.day}>
            {seg(t).map(([fill, n]) => { const h = (n / max) * Ht; y -= h; return h > 0 && <rect key={fill} x={x} y={y} width={bw} height={h} fill={fill} rx={n === t.total ? 4 : 0} />; })}
            {trend.length <= 14 && t.total > 0 && <text x={x + bw / 2} y={y - 4} textAnchor="middle" fontSize="9" fontWeight="700" fill="#334155">{formatNumber(t.total)}</text>}
            {(trend.length <= 14 || i % 5 === 0) && <text x={x + bw / 2} y={Ht + 34} textAnchor="middle" fontSize="9" fill="#64748b">{dayjs(t.day).format("D/M")}</text>}
          </g>
        );
      })}
    </svg>
  );
}

/** This period against the one before, as paired horizontal bars. */
function Compare({ current, previous }: { current: PeriodTotals; previous: PeriodTotals }) {
  const rows = [["Total", current.total, previous.total, "#7c3aed"], ["Negatif", current.neg, previous.neg, SEG.neg], ["Positif", current.pos, previous.pos, SEG.pos], ["Netral", current.labelled - current.neg - current.pos, previous.labelled - previous.neg - previous.pos, SEG.neu]] as const;
  const max = Math.max(1, ...rows.flatMap((x) => [x[1], x[2]]));
  return (
    <div className={r.compare}>
      {rows.map(([label, now, before, color]) => (
        <div key={label}>
          <span>{label}</span>
          <div><i style={{ width: `${(now / max) * 100}%`, background: color }} /><b>{formatNumber(now)}</b></div>
          <div><i style={{ width: `${(before / max) * 100}%`, background: color, opacity: 0.3 }} /><b>{formatNumber(before)}</b></div>
        </div>
      ))}
      <p>Batang tebal = periode ini, batang pudar = periode sebelumnya.</p>
    </div>
  );
}

function Legend() {
  return <p className={r.legend}>{[[SEG.neg, "Negatif"], [SEG.neu, "Netral"], [SEG.pos, "Positif"], [SEG.rest, "Belum berlabel"]].map(([c, l]) => <span key={l}><i style={{ background: c }} />{l}</span>)}</p>;
}

function Moods({ moods, fallback }: { moods: MoodCount[]; fallback: string }) {
  const total = moods.reduce((s, m) => s + m.n, 0);
  if (!total) return <p className={r.narrative}>{fallback}</p>;
  const R = 40, C = 2 * Math.PI * R;
  let off = 0;
  return (
    <div className={r.moods}>
      <svg viewBox="0 0 100 100" width="96" height="96" role="img" aria-label="Sebaran emosi">
        <g transform="rotate(-90 50 50)">
          {moods.map((m) => { const len = (m.n / total) * C, el = <circle key={m.value} cx="50" cy="50" r={R} fill="none" stroke={moodColorVar(m.value)} strokeWidth="16" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} />; off += len; return el; })}
        </g>
        <text x="50" y="48" textAnchor="middle" fontSize="13" fontWeight="800" fill="#1e1b4b">{formatNumber(total)}</text>
        <text x="50" y="60" textAnchor="middle" fontSize="7" fill="#64748b">berlabel</text>
      </svg>
      <ul className={r.moodList}>{moods.slice(0, 6).map((m) => <li key={m.value}><i style={{ background: moodColorVar(m.value) }} />{moodInfo(m.value).label}<b>{pct(m.n, total)}</b></li>)}</ul>
    </div>
  );
}

function Totals({ ins, label }: { ins: Insights; label: string }) {
  const { current: c, previous: p } = ins;
  return (
    <div className={r.kpis}>
      <div><small>{label}</small><b>{formatNumber(c.total)}</b><em>{delta(c.total, p.total)} vs periode lalu</em></div>
      <div><small>Berlabel emosi</small><b>{pct(c.labelled, c.total)}</b><em>{formatNumber(c.labelled)} post</em></div>
      <div><small>Porsi negatif</small><b>{pct(c.neg, c.labelled)}</b><em>sebelumnya {pct(p.neg, p.labelled)}</em></div>
      <div><small>Porsi positif</small><b>{pct(c.pos, c.labelled)}</b><em>sebelumnya {pct(p.pos, p.labelled)}</em></div>
    </div>
  );
}

function Ranking({ rows, title }: { rows: { value: string; n: number; prev: number }[]; title: string }) {
  return (
    <div>
      <h3>{title}</h3>
      {rows.length ? <table className={r.table}><tbody>{rows.slice(0, 8).map((x) => <tr key={x.value}><td>{x.value}</td><td className={r.num}>{formatNumber(x.n)}</td><td className={r.num}>{delta(x.n, x.prev)}</td></tr>)}</tbody></table> : <p className={r.empty}>Belum ada data.</p>}
    </div>
  );
}

function MediaPage({ type, ins, moods, days, n, total, sifat }: { type: MediaType; ins: Insights; moods: MoodCount[]; days: number; n: number; total: number; sifat: string }) {
  return (
    <Page n={n} total={total} sifat={sifat}>
      <H sub={`${days} hari terakhir dibanding ${days} hari sebelumnya`}>{MEDIA_TYPE_LABEL[type]}</H>
      <Totals ins={ins} label={type === "social" ? "Total post" : "Total berita"} />
      <h3>Volume harian</h3>
      <TrendChart trend={ins.trend} current={ins.current} previous={ins.previous} />{ins.trend.length >= 3 && <Legend />}
      <div className={r.two}>
        <div><h3>Sebaran emosi</h3><Moods moods={moods} fallback={narrative(type, ins)} /></div>
        <Ranking rows={ins.categories} title="Kategori teratas" />
      </div>
      <div className={r.two}>
        {type === "social" ? (
          <>
            <div>
              <h3>Aktor kunci (akun)</h3>
              <table className={r.table}><tbody>{(ins.accounts ?? []).slice(0, 8).map((a) => <tr key={a.source + a.username}><td>{a.name ?? a.username}<small> @{a.username} · {sourceLabel(a.source)}</small></td><td className={r.num}>{formatNumber(a.n)}</td><td className={r.num}>{pct(a.neg, a.labelled)} neg</td></tr>)}</tbody></table>
            </div>
            <div>
              <h3>Peta platform</h3>
              <table className={r.table}><tbody>{(ins.engagement ?? []).map((e) => <tr key={e.source}><td>{sourceLabel(e.source)}</td><td className={r.num}>{formatNumber(e.posts)} post</td><td className={r.num}>{e.current.likes === null ? "—" : `${formatNumber(e.current.likes)} like`}</td></tr>)}</tbody></table>
            </div>
          </>
        ) : (
          <>
            <div className={ins.keywords ? undefined : r.wide}>
              <h3>Media teratas</h3>
              <table className={r.table}><tbody>{(ins.media ?? []).slice(0, ins.keywords ? 8 : 10).map((m) => <tr key={m.source}><td>{sourceLabel(m.source)}</td><td className={r.num}>{formatNumber(m.n)}</td><td className={r.num}>{pct(m.neg, m.labelled)} neg</td></tr>)}</tbody></table>
            </div>
            {ins.keywords ? <Ranking rows={ins.keywords} title="Kata kunci" /> : <div />}
          </>
        )}
      </div>
      <div className={r.callout}><IconBulb size={26} /><p>{insight(ins)}</p></div>
    </Page>
  );
}

function IssueCard({ issue }: { issue: OntIssue }) {
  return (
    <article className={r.issue} style={{ borderLeftColor: levelColor(issue.level) }}>
      <header><span style={{ background: levelColor(issue.level) }}>{issue.level}</span><h3>{issue.title}</h3><em>skor {Math.round(issue.score)} · {formatNumber(issue.postCount)} post</em></header>
      {issue.summary && <p>{issue.summary}</p>}
      <dl>
        {issue.reaction && <><dt>Reaksi publik</dt><dd>{issue.reaction}</dd></>}
        {issue.risk && <><dt>Implikasi</dt><dd>{issue.risk}</dd></>}
        {!!issue.actors.length && <><dt>Aktor</dt><dd>{issue.actors.join(", ")}</dd></>}
        {!!issue.targets.length && <><dt>Target</dt><dd>{issue.targets.join(", ")}</dd></>}
        {issue.window && <><dt>Jendela waktu</dt><dd>{formatWindow(issue.window)}</dd></>}
      </dl>
    </article>
  );
}

/** One plain-language reading of the period, shown in the callout under each media page. */
function insight(ins: Insights) {
  const { current: c, previous: p } = ins;
  const neg = c.labelled ? Math.round((c.neg / c.labelled) * 100) : 0, was = p.labelled ? Math.round((p.neg / p.labelled) * 100) : null;
  const top = ins.categories[0];
  return `Volume ${delta(c.total, p.total) === "baru" ? "baru tercatat" : `${delta(c.total, p.total)} dibanding periode sebelumnya`}; porsi negatif ${neg}%${was === null ? "" : ` (sebelumnya ${was}%)`}.${top ? ` Kategori terbanyak: ${top.value}.` : ""}`;
}

const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/** Horizontal bars, longest first. */
function BarList({ rows, color = "#1f3a5f", empty = "Belum ada data." }: { rows: { name: string; n: number; note?: string }[]; color?: string; empty?: string }) {
  const max = Math.max(1, ...rows.map((x) => x.n));
  if (!rows.length) return <p className={r.empty}>{empty}</p>;
  return (
    <ul className={r.bars}>{rows.map((x) => (
      <li key={x.name}><span>{x.name}</span><div><i style={{ width: `${(x.n / max) * 100}%`, background: color }} /></div><b>{formatNumber(x.n)}{x.note && <small> {x.note}</small>}</b></li>
    ))}</ul>
  );
}

const excerpt = (item: MediaItem) => {
  const text = (item.content ?? item.title ?? "").replace(/\s+/g, " ").trim();
  return text.length > 230 ? `${text.slice(0, 227)}…` : text;
};

/** 24-hour early-warning meters (against the daily average of the 7 days before) and the most intense negative posts. */
function WarningPage({ x, n, total, sifat }: { x: ReportSection; n: number; total: number; sifat: string }) {
  const base = x.social?.insights ?? x.online?.insights;
  const pulse = base?.pulse;
  const spikes = [x.social?.insights, x.online?.insights].flatMap((ins, k) => (ins?.alerts ?? []).flatMap((a) => (a.kind === "spike" ? [{ ...a, type: (k ? "online" : "social") as MediaType }] : [])));
  const share = (w?: { neg: number; labelled: number }) => (w && w.labelled ? Math.round((w.neg / w.labelled) * 100) : null);
  const now = share(pulse?.now), avg = share(pulse?.avg);
  const hot = x.social?.insights.pulse;
  const intense = x.social?.insights.intense ?? [];
  const worse = (a: number | null, b: number | null) => a !== null && b !== null && a > b;
  return (
    <Page n={n} total={total} sifat={sifat}>
      <H sub="24 jam terakhir dibanding rata-rata harian 7 hari sebelumnya">Peringatan dini</H>
      <div className={r.meters}>
        <div data-warn={worse(hot?.now.hot ?? null, hot?.avg.hot ?? null) || undefined}><small>Post negatif intensitas sangat tinggi</small><b>{hot ? formatNumber(hot.now.hot) : "—"}</b><em>{hot ? `biasanya ${formatNumber(hot.avg.hot)}/hari` : "hanya media sosial"}</em></div>
        <div data-warn={worse(now, avg) || undefined}><small>Porsi negatif</small><b>{now === null ? "—" : `${now}%`}</b><em>{avg === null ? "belum ada pembanding" : `rata-rata ${avg}%`}</em></div>
        <div data-warn={spikes.length > 0 || undefined}><small>Lonjakan topik &amp; kata kunci</small><b>{spikes.length ? `${spikes.length} lonjakan` : "Tidak ada"}</b><em>{spikes.length ? "di atas batas wajar" : "dalam batas wajar"}</em></div>
      </div>
      {spikes.length > 0 && <>
        <h3>Topik yang melonjak</h3>
        <BarList color="#b4443a" rows={spikes.slice(0, 6).map((a) => ({ name: `${a.source === "keyword" ? `“${a.label}”` : capitalize(a.label)} · ${MEDIA_TYPE_LABEL[a.type]}`, n: a.n, note: `(${(a.n / Math.max(1, a.avg)).toFixed(1).replace(".", ",")}×)` }))} />
      </>}
      <h3>Post negatif paling intens</h3>
      {intense.length ? (
        <ul className={r.quotes}>{intense.slice(0, 6).map((p) => (
          <li key={p.code}>
            <header><b>{p.author?.name ?? p.author?.username ?? "—"}</b><span>{sourceLabel(p.source)}</span>{p.mood && <em>{moodInfo(p.mood).label}{p.moodLevel ? ` · level ${p.moodLevel}` : ""}</em>}</header>
            <p>{excerpt(p)}</p>
          </li>
        ))}</ul>
      ) : <p className={r.empty}>Tidak ada post negatif berintensitas tinggi dalam 24 jam terakhir.</p>}
    </Page>
  );
}

/** Online news issues ranked by score. */
function NewsIssuesPage({ rows, n, total, sifat }: { rows: IssueSummary[]; n: number; total: number; sifat: string }) {
  const active = rows.filter((i) => i.active).length;
  return (
    <Page n={n} total={total} sifat={sifat}>
      <H sub="Klaster berita online yang saling terkait, diurutkan menurut skor">Isu media online</H>
      <table className={r.table} data-matrix>
        <thead><tr><th>#</th><th>Isu</th><th className={r.num}>Berita</th><th className={r.num}>Skor</th><th>Terakhir</th><th>Status</th></tr></thead>
        <tbody>{rows.map((i, k) => <tr key={i.id}><td>{k + 1}</td><td>{i.label ?? i.title}</td><td className={r.num}>{formatNumber(i.newsCount)}</td><td className={r.num}>{Math.round(i.score)}</td><td>{dayjs(i.lastSeenAt).locale("id").format("D MMM, HH.mm")}</td><td>{i.active ? "Aktif" : "Reda"}</td></tr>)}</tbody>
      </table>
      <div className={r.callout}><IconNews size={26} /><p>{rows.length} isu berita teratas, {active} di antaranya masih aktif. Isu dengan skor tertinggi: “{rows[0].label ?? rows[0].title}” ({formatNumber(rows[0].newsCount)} berita).</p></div>
    </Page>
  );
}

/** Social engagement per platform, plus the busiest hashtags. */
function EngagementPage({ ins, n, total, sifat }: { ins: Insights; n: number; total: number; sifat: string }) {
  const metrics = [["likes", "Like"], ["comments", "Komentar"], ["shares", "Share"], ["views", "Views"]] as const;
  const rows = ins.engagement ?? [];
  const max = (k: (typeof metrics)[number][0]) => Math.max(1, ...rows.map((e) => e.current[k] ?? 0));
  return (
    <Page n={n} total={total} sifat={sifat}>
      <H sub="Total periode ini per platform; batang dibandingkan antar platform">Engagement &amp; hashtag</H>
      <table className={r.table} data-matrix>
        <thead><tr><th>Platform</th><th className={r.num}>Post</th>{metrics.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead>
        <tbody>{rows.map((e) => (
          <tr key={e.source}><td>{sourceLabel(e.source)}</td><td className={r.num}>{formatNumber(e.posts)}</td>
            {metrics.map(([k]) => { const v = e.current[k]; return <td key={k} className={r.cellBar}>{v === null ? "—" : <><i style={{ width: `${(v / max(k)) * 100}%` }} />{formatNumber(v)}</>}</td>; })}
          </tr>
        ))}</tbody>
      </table>
      <h3>Hashtag teratas</h3>
      <BarList color="#3f8f78" rows={(ins.hashtags ?? []).slice(0, 10).map((h) => ({ name: h.value.startsWith("#") ? h.value : `#${h.value}`, n: h.n, note: delta(h.n, h.prev) }))} empty="Belum ada hashtag pada periode ini." />
    </Page>
  );
}

/** Actors, targets and places the early-warning issues name most often. */
function ActorsPage({ issues, n, total, sifat }: { issues: OntIssue[]; n: number; total: number; sifat: string }) {
  const actors = entityRanking(issues, "actors"), targets = entityRanking(issues, "targets"), places = locationRanking(issues);
  return (
    <Page n={n} total={total} sifat={sifat}>
      <H sub={`Dari ${issues.length} isu peringatan dini; angka = jumlah isu yang menyebutnya`}>Aktor, target &amp; wilayah</H>
      <div className={r.two}>
        <div><h3>Aktor</h3><BarList rows={actors} color="#7c5cbf" /></div>
        <div><h3>Target</h3><BarList rows={targets} color="#1d63c4" /></div>
      </div>
      <h3>Wilayah isu</h3>
      <BarList rows={places} color="#b8962e" empty="Lokasi isu belum tercatat." />
      {actors[0] && <div className={r.callout}><IconUsers size={26} /><p>“{actors[0].name}” paling sering muncul sebagai aktor ({actors[0].n} isu){targets[0] ? `, sedangkan “${targets[0].name}” paling sering menjadi target (${targets[0].n} isu)` : ""}.</p></div>}
    </Page>
  );
}

const sectionPages = (x: ReportSection, notes: boolean) =>
  1 + (x.social ? 2 : 0) + (x.online ? 1 : 0) + 1 + (x.newsIssues.length ? 1 : 0) + (x.issues.length || notes ? 1 : 0) + (x.issues.length ? 1 : 0) + chunk(x.issues, 3).length;

function Notes({ d }: { d: ReportData }) {
  const source = d.mode === "bank" ? "semua data"
    : d.mode === "multi" ? "setiap proyek dihitung terpisah sesuai cakupannya"
    : `dibatasi cakupan proyek ${d.sections[0].project?.name}${d.sections[0].project?.keywords.length ? ` (kata kunci: ${d.sections[0].project.keywords.join(", ")})` : ""}`;
  return (
    <>
      <div className={r.notesHead}><H>Sumber &amp; metodologi</H></div>
      <ul className={r.notes}>
        <li>Data: post media sosial dan berita online dari bank data Signalbase, {source}.</li>
        <li>Periode: {d.days} hari terakhir dibanding {d.days} hari sebelumnya; hari ini belum lengkap.</li>
        <li>Emosi: label hasil analisis otomatis; porsi dihitung dari post yang sudah berlabel.</li>
        <li>Isu EWS: peringatan dini dari klaster post media sosial (level High/Critical); “Implikasi” adalah penilaian risiko otomatis dan perlu ditinjau analis.</li>
      </ul>
    </>
  );
}

/** Summary, media pages, issue matrix and issue cards of one project (or the whole bank). `start` is the page number before its first page. */
function Section({ x, d, mode, start, total, sifat, period, to, untuk, notes }: {
  x: ReportSection; d: ReportData; mode: ReportData["mode"]; start: number; total: number; sifat: string; period: string; to: dayjs.Dayjs; untuk: string; notes: boolean;
}) {
  const heat = issueHeat(x.issues);
  const parts = ([["social", x.social], ["online", x.online]] as const).flatMap(([t, v]) => (v ? [[t, v] as const] : []));
  const issuePages = chunk(x.issues, 3);
  const volume = parts.reduce((a, [, v]) => a + v.insights.current.total, 0), before = parts.reduce((a, [, v]) => a + v.insights.previous.total, 0);
  let n = start;
  return (
    <>
      <Page n={++n} total={total} sifat={sifat}>
        <div className={r.title}>
          <small>SISTEM PENDUKUNG KEPUTUSAN</small><h1>LAPORAN EKSEKUTIF</h1>
          <h2>INTELIJEN ISU PUBLIK {mode === "multi" ? x.project?.name.toUpperCase() : reportTitle(d)}</h2>
          <p>Periode {period} &nbsp;|&nbsp; Disusun {fmtDate(to)}</p>
          {untuk && <b>UNTUK: {untuk.toUpperCase()}</b>}
        </div>
        <div className={r.tiles}>
          <div style={{ background: "#1f3a5f" }}><b>{formatNumber(volume)}</b><small>Total unggahan dianalisis</small></div>
          {parts.map(([t, v], k) => <div key={t} style={{ background: ["#b8962e", "#b4443a"][k] }}><b>{pct(v.insights.current.neg, v.insights.current.labelled)}</b><small>Porsi negatif {MEDIA_TYPE_LABEL[t]}</small></div>)}
          <div style={{ background: "#3f8f78" }}><b>{x.issues.length}</b><small>Isu EWS dipantau</small></div>
          <div style={{ background: heat.color }}><b>{heat.label}</b><small>Suhu isu</small></div>
        </div>
        <div className={r.band}>
          <h3>RINGKASAN SATU LAYAR</h3>
          <div><IconAlertTriangle size={34} color="#fbbf24" /><div><h4>Suhu isu:</h4><p><b>{heat.label}</b>, volume {delta(volume, before) === "baru" ? "baru tercatat" : `${delta(volume, before)} dibanding periode sebelumnya`}. {x.issues.filter((i) => i.level === "Critical").length} isu Critical dan {x.issues.filter((i) => i.level === "High").length} isu High terdeteksi.</p></div></div>
          <div><IconSpeakerphone size={34} color="#fbbf24" /><div><h4>{Math.min(4, x.issues.length)} isu teratas:</h4>
            {x.issues.length ? <ol>{x.issues.slice(0, 4).map((i) => <li key={i.id}>{i.title}</li>)}</ol> : <p>Tidak ada isu peringatan dini pada periode ini.</p>}</div></div>
        </div>
        <div className={r.two}>{parts.map(([t, v]) => <div key={t}><h3>Emosi {MEDIA_TYPE_LABEL[t]}</h3><Moods moods={v.moods} fallback={narrative(t, v.insights)} /></div>)}</div>
        <div className={r.two}>{parts.map(([t, v]) => <div key={t}><h3>Kategori {MEDIA_TYPE_LABEL[t]}</h3><Ranking rows={v.insights.categories} title="" /></div>)}</div>
      </Page>

      {parts.map(([t, v]) => <MediaPage key={t} type={t} ins={v.insights} moods={v.moods} days={d.days} n={++n} total={total} sifat={sifat} />)}
      {x.social && <EngagementPage ins={x.social.insights} n={++n} total={total} sifat={sifat} />}
      <WarningPage x={x} n={++n} total={total} sifat={sifat} />
      {x.newsIssues.length > 0 && <NewsIssuesPage rows={x.newsIssues} n={++n} total={total} sifat={sifat} />}

      {(x.issues.length > 0 || notes) && (
        <Page n={++n} total={total} sifat={sifat}>
          {x.issues.length > 0 && <>
            <H sub="Diurutkan menurut skor peringatan dini">Matriks prioritas isu</H>
            <table className={r.table} data-matrix>
              <thead><tr><th>#</th><th>Isu</th><th>Level</th><th className={r.num}>Skor</th><th className={r.num}>Post</th><th>Kategori</th></tr></thead>
              <tbody>{x.issues.map((i, k) => <tr key={i.id}><td>{k + 1}</td><td>{i.title}</td><td><span className={r.pill} style={{ background: levelColor(i.level) }}>{i.level.toUpperCase()}</span></td><td className={r.num}>{Math.round(i.score)}</td><td className={r.num}>{formatNumber(i.postCount)}</td><td>{i.category ? capitalize(i.category) : "—"}</td></tr>)}</tbody>
            </table>
          </>}
          {notes && <Notes d={d} />}
        </Page>
      )}

      {x.issues.length > 0 && <ActorsPage issues={x.issues} n={++n} total={total} sifat={sifat} />}

      {issuePages.map((group, k) => (
        <Page key={k} n={++n} total={total} sifat={sifat}>
          <H sub="Ringkasan, reaksi publik, dan implikasi">Isu prioritas</H>
          {group.map((i) => <IssueCard key={i.id} issue={i} />)}
        </Page>
      ))}
    </>
  );
}

/** Combined report: how the projects compare, then the methodology. */
function Comparison({ d, n, total, sifat }: { d: ReportData; n: number; total: number; sifat: string }) {
  return (
    <Page n={n} total={total} sifat={sifat}>
      <H sub={`${d.sections.length} proyek, masing-masing dihitung sesuai cakupannya`}>Perbandingan proyek</H>
      <table className={r.table} data-matrix>
        <thead><tr><th>Proyek</th><th className={r.num}>Volume</th><th className={r.num}>Negatif sosial</th><th className={r.num}>Negatif online</th><th className={r.num}>Isu EWS</th><th>Suhu</th></tr></thead>
        <tbody>{d.sections.map((x) => {
          const heat = issueHeat(x.issues), vol = (x.social?.insights.current.total ?? 0) + (x.online?.insights.current.total ?? 0), neg = (v: typeof x.social) => (v ? pct(v.insights.current.neg, v.insights.current.labelled) : "—");
          return <tr key={x.project?.name}><td>{x.project?.name}</td><td className={r.num}>{formatNumber(vol)}</td><td className={r.num}>{neg(x.social)}</td><td className={r.num}>{neg(x.online)}</td><td className={r.num}>{x.issues.length}</td><td><span className={r.pill} style={{ background: heat.color }}>{heat.label}</span></td></tr>;
        })}</tbody>
      </table>
      <Notes d={d} />
    </Page>
  );
}

function Document({ d, untuk, sifat, author }: { d: ReportData; untuk: string; sifat: string; author: string }) {
  const to = dayjs(d.at), from = to.subtract(d.days - 1, "day");
  const period = `${fmtDate(from)} – ${fmtDate(to)}`;
  const multi = d.mode === "multi";
  // Notes sit on the comparison page of a combined report, else on the matrix page of the only section.
  const sizes = d.sections.map((x) => sectionPages(x, !multi));
  const total = 2 + (multi ? 1 : 0) + sizes.reduce((a, b) => a + b, 0); // + cover and closing page
  const starts = sizes.map((_, k) => 1 + (multi ? 1 : 0) + sizes.slice(0, k).reduce((a, b) => a + b, 0));
  return (
    <>
      <section className={`${r.page} ${r.cover}`} data-report-page>
        <Net id="glow" />
        <div className={r.coverTop}><span className={r.sifatBox}>SIFAT: {sifat}</span><span className={r.brand}><LogoMark size={30} />Signal<b>base</b></span></div>
        <div className={r.coverMid}>
          <small>SISTEM PENDUKUNG KEPUTUSAN</small>
          <h1>LAPORAN EKSEKUTIF</h1>
          <h2>INTELIJEN ISU PUBLIK<br />{reportTitle(d)}</h2>
          <p>Periode {period} &nbsp;|&nbsp; Disusun {fmtDate(to)}</p>
        </div>
        <div className={r.coverFor}>
          {untuk && <small>UNTUK: {untuk.toUpperCase()}</small>}
          <span>Disusun oleh {author} · {to.format("HH.mm")} WIB</span>
        </div>
      </section>
      {multi && <Comparison d={d} n={2} total={total} sifat={sifat} />}
      {d.sections.map((x, k) => <Section key={x.project?.name ?? "bank"} x={x} d={d} mode={d.mode} start={starts[k]} total={total} sifat={sifat} period={period} to={to} untuk={untuk} notes={!multi} />)}

      <section className={`${r.page} ${r.cover} ${r.closing}`} data-report-page>
        <Net id="glow2" />
        <div className={r.coverTop}><span className={r.sifatBox}>SIFAT: {sifat}</span><span className={r.brand}><LogoMark size={30} />Signal<b>base</b></span></div>
        <div className={r.closeMid}>
          <small>PENUTUP</small>
          <h1>Terima kasih</h1>
          <span className={r.rule} />
          <p>{closingNarrative(d)}</p>
          <p>Laporan ini disusun otomatis dari data media sosial dan media online yang terkumpul di Signalbase untuk mendukung pengambilan keputusan. Mohon tinjau bersama analis sebelum menjadi dasar tindakan.</p>
        </div>
        <div className={r.coverFor}>
          {untuk && <small>UNTUK: {untuk.toUpperCase()}</small>}
          <span>Disusun oleh {author} · {fmtDate(to)}, {to.format("HH.mm")} WIB</span>
          <span className={r.pageNo}>{total} / {total}</span>
        </div>
      </section>
    </>
  );
}

const PAGE_W = 794, PAGE_H = 1123; // A4 at 96 dpi

/** Photographs every page and joins them into one A4 PDF that downloads straight away (text in it is an image). */
async function savePdf(name: string) {
  const [{ toJpeg }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
  await document.fonts.ready;
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  const pages = document.querySelectorAll<HTMLElement>("[data-report-page]");
  for (const [i, page] of [...pages].entries()) {
    const img = await toJpeg(page, { quality: 0.92, pixelRatio: 2, width: PAGE_W, height: PAGE_H, style: { margin: "0", boxShadow: "none" } });
    if (i) pdf.addPage();
    pdf.addImage(img, "JPEG", 0, 0, 210, 297);
  }
  pdf.save(`${name}.pdf`);
}

export function Report({ author }: { author: string }) {
  const sp = useSearchParams();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const download = () => {
    setSaving(true); setSaveError(null);
    savePdf(document.title).catch(() => setSaveError("PDF gagal dibuat. Coba lagi, atau pakai Cetak lalu Simpan sebagai PDF.")).finally(() => setSaving(false));
  };
  const days = sp.get("days") ?? "1", key = sp.get("key");
  const { data, error } = useApi<ReportData>(`/api/admin/report?days=${encodeURIComponent(days)}${key ? `&key=${encodeURIComponent(key)}` : ""}`);
  useEffect(() => {
    if (!data) return;
    document.title = reportFileName(data); // the PDF file name, also the suggested one when printing
  }, [data]);
  return (
    <div className={r.root}>
      <div className={r.toolbar}>
        <b>Pratinjau laporan</b>
        <span>{saveError ?? "Unduh langsung sebagai PDF, atau cetak lewat browser."}</span>
        <button type="button" onClick={download} disabled={!data || saving} data-primary>{saving ? "Membuat PDF…" : "Download PDF"}</button>
        <button type="button" onClick={() => window.print()}>Cetak</button>
      </div>
      {error && <p className={r.state}>{error}</p>}
      {!data && !error && <p className={r.state}>Menyusun laporan…</p>}
      {data && <Document d={data} untuk={sp.get("untuk") ?? ""} sifat={sp.get("sifat") || DEFAULT_SIFAT} author={author} />}
    </div>
  );
}
