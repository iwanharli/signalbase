"use client";
// Executive report as A4 pages for the browser's print dialog ("Simpan sebagai PDF"). Opened from Ringkasan with
// ?days=&key=&untuk=&sifat=; prints itself once the data is in.
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import dayjs from "dayjs";
import { IconAlertTriangle, IconBulb, IconSpeakerphone } from "@tabler/icons-react";
import "dayjs/locale/id";
import { LogoMark } from "../Logo";
import type { Insights, PeriodTotals, TrendPoint } from "@/lib/media/insights";
import { capitalize, formatNumber, MEDIA_TYPE_LABEL, sourceLabel } from "@/lib/media/labels";
import { moodColorVar, moodInfo } from "@/lib/media/mood";
import type { MediaType, MoodCount } from "@/lib/media/types";
import { formatWindow, levelColor, type OntIssue } from "@/lib/ontologi";
import { changePct, DEFAULT_SIFAT, issueHeat, narrative, type ReportData } from "@/lib/report";
import { useApi } from "@/lib/useApi";
import r from "./report.module.css";

// Decorative network on the cover: [x, y, radius] nodes and the pairs joined by a line.
const NODES: [number, number, number][] = [[105, 52, 3], [70, 40, 1.6], [140, 38, 1.8], [40, 62, 1.4], [170, 66, 1.6], [90, 80, 1.5], [125, 84, 1.7], [20, 30, 1.2], [190, 28, 1.2], [60, 96, 1.3], [155, 100, 1.3], [105, 18, 1.4]];
const NET: [number, number][] = [[0, 1], [0, 2], [0, 5], [0, 6], [0, 11], [1, 3], [1, 7], [1, 11], [2, 4], [2, 8], [2, 11], [3, 5], [3, 9], [4, 6], [4, 10], [5, 9], [6, 10], [5, 6]];

const fmtDate = (d: dayjs.Dayjs) => d.locale("id").format("D MMMM YYYY");
const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : "—");
const delta = (now: number, before: number) => { const p = changePct(now, before); return p === null ? "baru" : `${p > 0 ? "+" : ""}${p}%`; };

function Page({ children, n, total, sifat }: { children: React.ReactNode; n: number; total: number; sifat: string }) {
  return (
    <section className={r.page}>
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

function Document({ d, untuk, sifat, author }: { d: ReportData; untuk: string; sifat: string; author: string }) {
  const to = dayjs(d.at), from = to.subtract(d.days - 1, "day");
  const period = `${fmtDate(from)} – ${fmtDate(to)}`;
  const heat = issueHeat(d.issues);
  const parts = ([["social", d.social], ["online", d.online]] as const).flatMap(([t, v]) => (v ? [[t, v] as const] : []));
  const issuePages = chunk(d.issues, 3);
  const total = 3 + parts.length + issuePages.length; // cover, summary, media pages, matrix + notes, issue pages
  const volume = parts.reduce((s, [, v]) => s + v.insights.current.total, 0), before = parts.reduce((s, [, v]) => s + v.insights.previous.total, 0);
  let n = 1;
  return (
    <>
      <section className={`${r.page} ${r.cover}`}>
        <svg className={r.net} viewBox="0 0 210 130" preserveAspectRatio="xMidYMid slice" aria-hidden>
          <defs><radialGradient id="glow"><stop offset="0" stopColor="#38bdf8" stopOpacity=".55" /><stop offset="1" stopColor="#38bdf8" stopOpacity="0" /></radialGradient></defs>
          <circle cx="105" cy="52" r="46" fill="url(#glow)" />
          {NET.map(([a, b], k) => <line key={k} x1={NODES[a][0]} y1={NODES[a][1]} x2={NODES[b][0]} y2={NODES[b][1]} stroke="#38bdf8" strokeOpacity=".35" strokeWidth=".3" />)}
          {NODES.map(([x, y, z], k) => <circle key={k} cx={x} cy={y} r={z} fill="#7dd3fc" fillOpacity=".85" />)}
        </svg>
        <div className={r.coverTop}><span className={r.sifatBox}>SIFAT: {sifat}</span><span className={r.brand}><LogoMark size={30} />Signal<b>base</b></span></div>
        <div className={r.coverMid}>
          <small>SISTEM PENDUKUNG KEPUTUSAN</small>
          <h1>LAPORAN EKSEKUTIF</h1>
          <h2>INTELIJEN ISU PUBLIK{d.project && <><br />{d.project.name.toUpperCase()}</>}</h2>
          <p>Periode {period} &nbsp;|&nbsp; Disusun {fmtDate(to)}</p>
        </div>
        <div className={r.coverFor}>
          {untuk && <><small>UNTUK: {untuk.toUpperCase()}</small></>}
          <span>Disusun oleh {author} · {to.format("HH.mm")} WIB</span>
        </div>
      </section>

      <Page n={++n} total={total} sifat={sifat}>
        <div className={r.title}>
          <small>SISTEM PENDUKUNG KEPUTUSAN</small><h1>LAPORAN EKSEKUTIF</h1><h2>INTELIJEN ISU PUBLIK{d.project && <> {d.project.name.toUpperCase()}</>}</h2>
          <p>Periode {period} &nbsp;|&nbsp; Disusun {fmtDate(to)}</p>
          {untuk && <b>UNTUK: {untuk.toUpperCase()}</b>}
        </div>
        <div className={r.tiles}>
          <div style={{ background: "#1f3a5f" }}><b>{formatNumber(volume)}</b><small>Total unggahan dianalisis</small></div>
          {parts.map(([t, v], k) => <div key={t} style={{ background: ["#b8962e", "#b4443a"][k] }}><b>{pct(v.insights.current.neg, v.insights.current.labelled)}</b><small>Porsi negatif {MEDIA_TYPE_LABEL[t]}</small></div>)}
          <div style={{ background: "#3f8f78" }}><b>{d.issues.length}</b><small>Isu EWS dipantau</small></div>
          <div style={{ background: heat.color }}><b>{heat.label}</b><small>Suhu isu</small></div>
        </div>
        <div className={r.band}>
          <h3>RINGKASAN SATU LAYAR</h3>
          <div><IconAlertTriangle size={34} color="#fbbf24" /><div><h4>Suhu isu:</h4><p><b>{heat.label}</b>, volume {delta(volume, before) === "baru" ? "baru tercatat" : `${delta(volume, before)} dibanding periode sebelumnya`}. {d.issues.filter((i) => i.level === "Critical").length} isu Critical dan {d.issues.filter((i) => i.level === "High").length} isu High terdeteksi.</p></div></div>
          <div><IconSpeakerphone size={34} color="#fbbf24" /><div><h4>{Math.min(4, d.issues.length)} isu teratas:</h4>
            {d.issues.length ? <ol>{d.issues.slice(0, 4).map((i) => <li key={i.id}>{i.title}</li>)}</ol> : <p>Tidak ada isu peringatan dini pada periode ini.</p>}</div></div>
        </div>
        <div className={r.two}>{parts.map(([t, v]) => <div key={t}><h3>Emosi {MEDIA_TYPE_LABEL[t]}</h3><Moods moods={v.moods} fallback={narrative(t, v.insights)} /></div>)}</div>
        <div className={r.two}>{parts.map(([t, v]) => <div key={t}><h3>Kategori {MEDIA_TYPE_LABEL[t]}</h3><Ranking rows={v.insights.categories} title="" /></div>)}</div>
      </Page>

      {parts.map(([t, v]) => <MediaPage key={t} type={t} ins={v.insights} moods={v.moods} days={d.days} n={++n} total={total} sifat={sifat} />)}

      <Page n={++n} total={total} sifat={sifat}>
        {d.issues.length > 0 && <>
          <H sub="Diurutkan menurut skor peringatan dini">Matriks prioritas isu</H>
          <table className={r.table} data-matrix>
            <thead><tr><th>#</th><th>Isu</th><th>Level</th><th className={r.num}>Skor</th><th className={r.num}>Post</th><th>Kategori</th></tr></thead>
            <tbody>{d.issues.map((i, k) => <tr key={i.id}><td>{k + 1}</td><td>{i.title}</td><td><span className={r.pill} style={{ background: levelColor(i.level) }}>{i.level.toUpperCase()}</span></td><td className={r.num}>{Math.round(i.score)}</td><td className={r.num}>{formatNumber(i.postCount)}</td><td>{i.category ? capitalize(i.category) : "—"}</td></tr>)}</tbody>
          </table>
        </>}
        <div className={r.notesHead}><H>Sumber &amp; metodologi</H></div>
        <ul className={r.notes}>
          <li>Data: post media sosial dan berita online dari bank data Signalbase{d.project ? `, dibatasi kata kunci proyek ${d.project.name}` : ", seluruh bank data"}.</li>
          <li>Periode: {d.days} hari terakhir dibanding {d.days} hari sebelumnya; hari ini belum lengkap.</li>
          <li>Emosi: label hasil analisis otomatis; porsi dihitung dari post yang sudah berlabel.</li>
          <li>Isu EWS: peringatan dini dari klaster post media sosial (level High/Critical); “Implikasi” adalah penilaian risiko otomatis dan perlu ditinjau analis.</li>
        </ul>
      </Page>

      {issuePages.map((group, k) => (
        <Page key={k} n={++n} total={total} sifat={sifat}>
          <H sub="Ringkasan, reaksi publik, dan implikasi">Isu prioritas</H>
          {group.map((i) => <IssueCard key={i.id} issue={i} />)}
        </Page>
      ))}

    </>
  );
}

export function Report({ author }: { author: string }) {
  const sp = useSearchParams();
  const days = sp.get("days") ?? "1", key = sp.get("key");
  const { data, error } = useApi<ReportData>(`/api/admin/report?days=${encodeURIComponent(days)}${key ? `&key=${encodeURIComponent(key)}` : ""}`);
  useEffect(() => {
    if (!data) return;
    const t = setTimeout(() => window.print(), 600); // let fonts and layout settle first
    return () => clearTimeout(t);
  }, [data]);
  return (
    <div className={r.root}>
      <div className={r.toolbar}>
        <b>Pratinjau laporan</b>
        <span>Pilih “Simpan sebagai PDF” di dialog cetak.</span>
        <button type="button" onClick={() => window.print()}>Cetak / Simpan PDF</button>
      </div>
      {error && <p className={r.state}>{error}</p>}
      {!data && !error && <p className={r.state}>Menyusun laporan…</p>}
      {data && <Document d={data} untuk={sp.get("untuk") ?? ""} sifat={sp.get("sifat") || DEFAULT_SIFAT} author={author} />}
    </div>
  );
}
