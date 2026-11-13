"use client";
// Executive brief (report version 2) as A4 pages in a restrained report style: running header and footer, numbered
// sections, light tables, numbered source references with the list in an appendix. Sections are blocks with an
// estimated height; blocks fill a page before the next one starts.
import dayjs from "dayjs";
import "dayjs/locale/id";
import { change, type BriefAi, type BriefData, type IssueRow, type Metric } from "@/lib/brief";
import { formatNumber, sourceLabel } from "@/lib/media/labels";
import { moodColorVar, moodInfo } from "@/lib/media/mood";
import { KIND_LABEL, periodLabel } from "@/lib/report";
import { LogoMark } from "../Logo";
import b from "./brief.module.css";

const n = (v: number | null | undefined) => (v === null || v === undefined ? "—" : formatNumber(v));
const dec = (v: number) => v.toLocaleString("id-ID", { maximumFractionDigits: 1 });
const compact = (v: number | null | undefined) => (v === null || v === undefined ? "—" : new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 }).format(v));

type Tone = "red" | "orange" | "amber" | "green" | "blue" | "gray" | "navy";
const LEVEL_TONE: Record<string, Tone> = { Critical: "red", High: "orange", Medium: "amber", Low: "gray" };
const PRIORITY_TONE: Record<string, Tone> = { SEGERA: "red", TINGGI: "orange", SEDANG: "amber", RENDAH: "gray" };
const FOLLOW_TONE: Record<string, Tone> = { terlihat: "green", sebagian: "amber", "belum terlihat": "red", "tidak dapat dinilai": "gray" };
const HEAT_TONE: Record<string, Tone> = { TINGGI: "red", WASPADA: "orange", TERKENDALI: "green" };
const issueTone = (i?: IssueRow): Tone => (i?.kind === "news" ? "blue" : LEVEL_TONE[i?.level ?? ""] ?? "gray");
const issueTag = (i?: IssueRow) => (i?.kind === "news" ? "BERITA" : (i?.level ?? "—").toUpperCase());

const Tag = ({ children, tone = "gray" }: { children: React.ReactNode; tone?: Tone }) => <span className={b.tag} data-tone={tone}>{children}</span>;

function Delta({ m, goodUp = true, points }: { m: Metric; goodUp?: boolean; points?: boolean }) {
  if (m.prev === null || m.prev === undefined) return <span className={b.delta}>—</span>;
  const diff = points ? Math.round((m.now - m.prev) * 10) / 10 : change(m);
  if (diff === null) return <span className={b.delta}>baru</span>;
  const good = diff === 0 ? undefined : (diff > 0) === goodUp;
  return <span className={b.delta} data-good={good === undefined ? undefined : String(good)}>{diff > 0 ? "▲" : diff < 0 ? "▼" : "■"} {dec(Math.abs(diff))}{points ? " pp" : "%"}</span>;
}

const Section = ({ no, title, lead }: { no?: string; title: string; lead?: string }) => (
  <header className={b.sec}><h2>{no && <span>{no}</span>}{title}</h2>{lead && <p>{lead}</p>}</header>
);
const H3 = ({ children }: { children: React.ReactNode }) => <h3 className={b.h3}>{children}</h3>;
const Note = ({ label, children, tone = "navy" }: { label: string; children: React.ReactNode; tone?: Tone }) => (
  <div className={b.note} data-tone={tone}><b>{label}</b><p>{children}</p></div>
);

/** Horizontal bars with the value at the end. */
function Bars({ rows, tone = "navy", format = n }: { rows: { label: string; value: number }[]; tone?: Tone; format?: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((x) => x.value));
  return (
    <div className={b.bars} data-tone={tone}>
      {rows.map((x) => <div key={x.label}><span>{x.label}</span><i><em style={{ width: `${(x.value / max) * 100}%` }} /></i><b>{format(x.value)}</b></div>)}
    </div>
  );
}

/** Daily columns for one measure (two of these side by side, never one chart with two y-axes). */
function DayColumns({ rows, color, label }: { rows: { day: string; value: number }[]; color: string; label: string }) {
  const max = Math.max(1, ...rows.map((x) => x.value));
  const W = 330, H = 100, step = W / rows.length, bw = Math.max(3, Math.min(22, step * 0.66));
  return (
    <figure className={b.cols}>
      <figcaption>{label}</figcaption>
      <svg viewBox={`0 0 ${W} ${H + 22}`} role="img" aria-label={label}>
        {[0.5, 1].map((f) => <line key={f} x1="0" x2={W} y1={H - (H - 12) * f} y2={H - (H - 12) * f} stroke="#e5e9f0" strokeDasharray="2 3" />)}
        <line x1="0" x2={W} y1={H} y2={H} stroke="#b9c2cf" />
        {rows.map((x, i) => {
          const h = (x.value / max) * (H - 12), cx = i * step + step / 2;
          return (
            <g key={x.day}>
              <rect x={cx - bw / 2} y={H - h} width={bw} height={h} rx="1.5" fill={color} />
              {rows.length <= 10 && <text x={cx} y={H - h - 3} textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#334155">{compact(x.value)}</text>}
              {(rows.length <= 10 || i % 5 === 0) && <text x={cx} y={H + 11} textAnchor="middle" fontSize="7.5" fill="#64748b">{dayjs(x.day).format("D/M")}</text>}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

function Donut({ rows }: { rows: { value: string; n: number }[] }) {
  const total = rows.reduce((t, x) => t + x.n, 0);
  if (!total) return <p className={b.muted}>Belum ada unggahan berlabel emosi.</p>;
  const R = 40, C = 2 * Math.PI * R;
  let off = 0;
  return (
    <div className={b.donut}>
      <svg viewBox="0 0 100 100" width="92" height="92" role="img" aria-label="Sebaran emosi">
        <g transform="rotate(-90 50 50)">
          {rows.map((m) => { const len = (m.n / total) * C, el = <circle key={m.value} cx="50" cy="50" r={R} fill="none" stroke={moodColorVar(m.value)} strokeWidth="13" strokeDasharray={`${Math.max(0, len - 0.6)} ${C - len + 0.6}`} strokeDashoffset={-off} />; off += len; return el; })}
        </g>
        <text x="50" y="50" textAnchor="middle" fontSize="12" fontWeight="800" fill="#0f2a43">{compact(total)}</text>
        <text x="50" y="61" textAnchor="middle" fontSize="7" fill="#64748b">berlabel</text>
      </svg>
      <ul>{rows.slice(0, 7).map((m) => <li key={m.value}><i style={{ background: moodColorVar(m.value) }} />{moodInfo(m.value).label}<b>{Math.round((m.n / total) * 100)}%</b></li>)}</ul>
    </div>
  );
}

type Block = { key: string; h: number; node: React.ReactNode; page: boolean };
/** Usable height of a page body in px and the gap between blocks; the estimates below err on the high side. */
const CAP = 975, GAP = 12, LINE = 13;
/** Lines a text needs at about `perLine` characters per line. */
const text = (s: string | null | undefined, perLine: number) => Math.max(1, Math.ceil((s?.length ?? 0) / perLine));
/** Height of a table: header plus each row as tall as its longest cell (`widths` = characters per line per column). */
const table = (rows: string[][], widths: number[] = []) =>
  24 + rows.reduce((t, cells) => t + 9 + LINE * Math.max(1, ...cells.map((c, i) => text(c, widths[i] ?? 70))), 0);
const cardHeight = (c: BriefAi["kartu"][number]) =>
  36 + 18 + Math.max(c.fakta.reduce((t, f) => t + text(f, 62) * LINE + 3, 0) + 16, text(c.implikasi, 62) * LINE + 16) + 14 + text(c.tindakan, 105) * LINE + 18;

const GLOSSARY: [string, string][] = [
  ["EWS", "Peringatan dini dari klaster unggahan media sosial; level Critical > High > Medium."],
  ["L1–L5", "Intensitas emosi unggahan; 5 = paling kuat."],
  ["Resonansi (/u)", "Interaksi per unggahan: seberapa kuat publik merespons."],
  ["Interaksi", "Jumlah suka, komentar, dan bagikan/repost."],
  ["Akun unik", "Jumlah akun berbeda yang mengunggah dalam periode."],
  ["Momentum", "Arah perhatian publik dibanding periode sebelumnya."],
  ["pp", "Poin persentase (selisih dua persentase)."],
];

export function BriefDocument({ d }: { d: BriefData }) {
  const ai = d.ai, k = d.kpi, p = d.profile;
  const sifat = p.sifat || "RAHASIA / TERBATAS";
  const period = periodLabel(d);
  const kindLabel = KIND_LABEL[d.kind];
  const at = dayjs(d.at).locale("id");
  const subject = p.region || d.scope.name;
  const lens = p.institution || p.recipientTitle;
  const reader = p.recipientTitle || lens;
  const heat = ai?.suhu.level ?? (k.critical ? "TINGGI" : k.ews.now ? "WASPADA" : "TERKENDALI");
  const issueOf = (code?: string) => d.issues.find((i) => i.code === code);
  const relevance = new Map((ai?.isuRelevansi ?? []).map((x) => [x.kode.toUpperCase(), x.relevansi]));
  const actorNote = new Map((ai?.aktor ?? []).map((x) => [x.akun.replace(/^@/, "").toLowerCase(), x]));
  const multiDay = d.daily.length > 1;
  const compareTo = d.days === 1 ? "hari sebelumnya" : `${d.days} hari sebelumnya`;

  // Sources are numbered in order of first citation and listed in the appendix.
  const refNo = new Map<string, number>();
  for (const code of [...(ai?.temuan ?? []).flatMap((x) => x.evidence), ...(ai?.kartu ?? []).flatMap((x) => x.evidence), ...(ai?.disinformasi ?? []).flatMap((x) => x.evidence)]) {
    if (d.sources[code] && !refNo.has(code)) refNo.set(code, refNo.size + 1);
  }
  const Refs = ({ codes }: { codes: string[] }) => {
    const nums = [...new Set(codes.map((c) => refNo.get(c)).filter((x): x is number => !!x))].sort((x, y) => x - y);
    return nums.length ? <sup className={b.ref}>[{nums.join(", ")}]</sup> : null;
  };

  const blocks: Block[] = [];
  const add = (key: string, h: number, node: React.ReactNode, page = false) => blocks.push({ key, h, node, page });

  // ---------------------------------------------------------------- executive summary
  const kpis: { label: string; value: string; m: Metric; goodUp?: boolean; points?: boolean }[] = [
    { label: "Unggahan media sosial", value: compact(k.posts.now), m: k.posts },
    { label: "Akun unik", value: compact(k.accounts.now), m: k.accounts },
    { label: "Total interaksi", value: compact(k.interactions.now), m: k.interactions },
    { label: "Artikel media online", value: compact(k.news.now), m: k.news },
    { label: "Porsi negatif sosmed", value: `${dec(k.negShare.now)}%`, m: k.negShare, goodUp: false, points: true },
    { label: "Isu EWS", value: `${k.ews.now}${k.critical ? ` · ${k.critical} Crit.` : ""}`, m: k.ews, goodUp: false },
  ];
  add("summary-head", 150 + (ai ? text(ai.suhu.ringkas, 115) * 15 : 30), <>
    <Section title="Ringkasan eksekutif" lead={`${kindLabel} · ${period} · dibanding ${compareTo}${reader ? ` · untuk ${reader}` : ""}`} />
    <div className={b.bluf} data-tone={HEAT_TONE[heat]}>
      <div className={b.blufTag}><small>SUHU ISU</small><b>{heat}</b>{ai && <span>Momentum {ai.suhu.momentum.toLowerCase()}</span>}</div>
      <p>{ai ? ai.suhu.ringkas : `${d.aiError ?? "Narasi analisis tidak tersedia."} Angka di laporan ini tetap lengkap.`}</p>
    </div>
    <dl className={b.kpis}>
      {kpis.map((x) => <div key={x.label}><dt>{x.label}</dt><dd>{x.value}</dd><Delta m={x.m} goodUp={x.goodUp} points={x.points} /></div>)}
    </dl>
  </>, true);
  if (ai?.keputusan.isu.length) add("decisions", 40 + table(ai.keputusan.isu.map((x) => [x.judul]), [95]), <>
    <H3>Keputusan yang dibutuhkan{reader ? ` dari ${reader}` : ""}</H3>
    <p className={b.lead}>{ai.keputusan.pengantar}</p>
    <table className={b.table}>
      <thead><tr><th className={b.no}>#</th><th>Keputusan</th><th className={b.right}>Tenggat</th></tr></thead>
      <tbody>{ai.keputusan.isu.map((x, i) => <tr key={i}><td className={b.no}>{i + 1}</td><td>{x.judul}</td><td className={b.right}><Tag tone={/SEGERA/i.test(x.tenggat) ? "red" : "amber"}>{x.tenggat}</Tag></td></tr>)}</tbody>
    </table>
  </>);
  if (ai?.temuan.length) {
    const col = (s: number) => ai.temuan.filter((_, i) => i % 2 === s).reduce((t, x) => t + 22 + text(x.isi, 58) * LINE, 0);
    add("findings", 30 + Math.max(col(0), col(1)), <>
      <H3>Temuan strategis</H3>
      <ol className={b.findings}>
        {ai.temuan.map((t, i) => <li key={i}><span>{i + 1}</span><div><b>{t.judul}</b><p>{t.isi}<Refs codes={t.evidence} /></p></div></li>)}
      </ol>
    </>);
  }

  // ---------------------------------------------------------------- 1. situation dashboard
  const kpiRows: [string, React.ReactNode, React.ReactNode, string | undefined][] = [
    ["Unggahan media sosial", n(k.posts.now), <Delta key="a" m={k.posts} />, ai?.catatanKpi.posts],
    ["Akun unik", n(k.accounts.now), <Delta key="b" m={k.accounts} />, ai?.catatanKpi.accounts],
    ["Total interaksi", n(k.interactions.now), <Delta key="c" m={k.interactions} />, ai?.catatanKpi.interactions],
    ["Total tayangan", n(k.views.now), <Delta key="d" m={k.views} />, ai?.catatanKpi.views],
    ["Artikel media online", n(k.news.now), <Delta key="e" m={k.news} />, ai?.catatanKpi.news],
    ["Porsi negatif media sosial", `${dec(k.negShare.now)}%`, <Delta key="f" m={k.negShare} goodUp={false} points />, ai?.catatanKpi.negShare],
    ["Isu peringatan dini (EWS)", `${k.ews.now}${k.critical ? ` (${k.critical} Critical)` : ""}`, <Delta key="g" m={k.ews} goodUp={false} />, ai?.catatanKpi.ews],
  ];
  add("kpi", 70 + table(kpiRows.map(([label, , , note]) => [label, note ?? ""]), [26, 62]), <>
    <Section no="1" title="Dasbor situasi" lead={`Angka ${period}, dibanding ${compareTo}`} />
    <H3>1.1 Angka kunci</H3>
    <table className={b.table}>
      <thead><tr><th>Indikator</th><th className={b.right}>Nilai</th><th className={b.right}>Perubahan</th><th>Catatan{reader ? ` bagi ${reader}` : ""}</th></tr></thead>
      <tbody>{kpiRows.map(([label, v, dl, note]) => <tr key={label}><td className={b.strong}>{label}</td><td className={b.right}>{v}</td><td className={b.right}>{dl}</td><td>{note ?? "—"}</td></tr>)}</tbody>
    </table>
  </>, true);
  add("trend", 26 + (multiDay ? 140 : 26 + d.platforms.length * 15) + (ai?.tren ? 30 + text(ai.tren.isi, 125) * LINE : 0), <>
    <H3>1.2 {multiDay ? "Tren harian" : "Sebaran per platform"}</H3>
    {multiDay ? (
      <div className={b.two}>
        <DayColumns rows={d.daily.map((x) => ({ day: x.day, value: x.posts }))} color="#1f3a5f" label="Unggahan media sosial per hari" />
        <DayColumns rows={d.daily.map((x) => ({ day: x.day, value: x.interactions }))} color="#b8902e" label="Interaksi per hari" />
      </div>
    ) : (
      <div className={b.two}>
        <div><small className={b.caption}>Unggahan per platform</small><Bars rows={d.platforms.map((x) => ({ label: sourceLabel(x.source), value: x.posts }))} /></div>
        <div><small className={b.caption}>Interaksi per platform</small><Bars rows={d.platforms.map((x) => ({ label: sourceLabel(x.source), value: x.interactions }))} tone="amber" format={compact} /></div>
      </div>
    )}
    {ai?.tren && <Note label={ai.tren.judul}>{ai.tren.isi}</Note>}
  </>);
  add("platforms", 26 + table(d.platforms.map(() => ["x"])) + (ai?.platform.length ? 8 + table(ai.platform.map((x) => [x.tujuan, x.alasan]), [22, 70]) : 0), <>
    <H3>1.3 Peta platform{reader ? ` — di mana ${reader} perlu hadir` : ""}</H3>
    <table className={b.table}>
      <thead><tr><th>Platform</th><th className={b.right}>Unggahan</th><th className={b.right}>Perubahan</th><th className={b.right}>Interaksi</th><th className={b.right}>Tayangan</th><th className={b.right}>Data terakhir</th></tr></thead>
      <tbody>{d.platforms.map((x) => (
        <tr key={x.source}><td className={b.strong}>{sourceLabel(x.source)}</td><td className={b.right}>{n(x.posts)}</td><td className={b.right}><Delta m={{ now: x.posts, prev: x.prevPosts }} /></td>
          <td className={b.right}>{compact(x.interactions)}</td><td className={b.right}>{x.views === null ? <span className={b.muted}>tidak dicatat</span> : compact(x.views)}</td>
          <td className={b.right} data-warn={(x.lastDay ?? "") < d.day || undefined}>{x.lastDay ? dayjs(x.lastDay).locale("id").format("D MMM") : "—"}</td></tr>
      ))}</tbody>
    </table>
    {ai?.platform.length ? (
      <table className={b.table}>
        <thead><tr><th>Tujuan</th><th>Kanal</th><th>Alasan</th></tr></thead>
        <tbody>{ai.platform.map((x, i) => <tr key={i}><td className={b.strong}>{x.tujuan}</td><td>{x.kanal}</td><td>{x.alasan}</td></tr>)}</tbody>
      </table>
    ) : null}
  </>);
  add("issueMatrix", 26 + (d.issues.length ? table(d.issues.slice(0, 12).map((i) => [i.title, relevance.get(i.code) ?? ""]), [52, 36]) : 20), <>
    <H3>1.4 Matriks prioritas isu{lens ? ` (lensa ${lens})` : ""}</H3>
    {d.issues.length ? (
      <table className={b.table}>
        <thead><tr><th className={b.no}>#</th><th>Isu</th><th>Jenis</th><th className={b.right}>Vol</th><th className={b.right}>Int/U</th><th>Relevansi</th></tr></thead>
        <tbody>{d.issues.slice(0, 12).map((i, x) => (
          <tr key={i.code}><td className={b.no}>{x + 1}</td>
            <td>{i.title}{i.sentDay && i.sentDay < d.start && <span className={b.muted}> · sejak {dayjs(i.sentDay).locale("id").format("D MMM")}</span>}</td>
            <td><Tag tone={issueTone(i)}>{issueTag(i)}</Tag></td>
            <td className={b.right}>{n(i.posts)}</td><td className={b.right}>{i.interactions && i.posts ? n(i.interactions / i.posts) : "—"}</td>
            <td>{relevance.get(i.code) ?? "—"}</td></tr>
        ))}</tbody>
      </table>
    ) : <p className={b.muted}>Tidak ada isu peringatan dini atau isu berita dalam periode ini.</p>}
  </>);
  add("emotions", 26 + 104 + (ai?.emosi ? 30 + text(ai.emosi, 125) * LINE : 0), <>
    <H3>1.5 Emosi publik</H3>
    <div className={b.two}>
      <Donut rows={d.emotions} />
      <div>
        <small className={b.caption}>Unggahan berintensitas tinggi (L4–L5) per emosi</small>
        <Bars rows={d.emotions.filter((e) => e.intense).slice(0, 6).map((e) => ({ label: moodInfo(e.value).label, value: e.intense }))} tone="red" />
      </div>
    </div>
    {ai?.emosi && <Note label="Bacaan emosi" tone="amber">{ai.emosi}</Note>}
  </>);

  // ---------------------------------------------------------------- 2. public space
  add("content", 62 + 22 + Math.min(7, d.categories.length) * 15 + (ai?.konten ? 30 + text(ai.konten, 125) * LINE : 0), <>
    <Section no="2" title={`Posisi ${lens || "institusi"} di ruang publik`} />
    <H3>2.1 Konten yang menembus vs yang gagal</H3>
    <div className={b.two}>
      <div><small className={b.caption}>Volume unggahan per kategori</small><Bars rows={d.categories.slice(0, 7).map((c) => ({ label: c.value.replace(/_/g, " "), value: c.posts }))} /></div>
      <div><small className={b.caption}>Resonansi (interaksi per unggahan)</small><Bars rows={d.categories.slice(0, 7).map((c) => ({ label: c.value.replace(/_/g, " "), value: c.posts ? c.interactions / c.posts : 0 }))} tone="amber" /></div>
    </div>
    {ai?.konten && <Note label="Implikasi komunikasi" tone="green">{ai.konten}</Note>}
  </>, true);
  add("actors", 26 + table(d.actors.slice(0, 10).map((a) => [actorNote.get(a.username.toLowerCase())?.karakter ?? "", actorNote.get(a.username.toLowerCase())?.tindakan ?? ""]), [18, 34]), <>
    <H3>2.2 Aktor kunci digital</H3>
    <table className={b.table}>
      <thead><tr><th className={b.no}>#</th><th>Akun</th><th>Platform</th><th className={b.right}>Unggahan</th><th className={b.right}>Interaksi</th><th className={b.right}>Negatif</th><th>Karakter</th><th>Tindakan</th></tr></thead>
      <tbody>{d.actors.slice(0, 10).map((a, i) => {
        const note = actorNote.get(a.username.toLowerCase());
        return <tr key={`${a.source}${a.username}`}><td className={b.no}>{i + 1}</td><td className={b.strong}>{a.username}</td><td>{sourceLabel(a.source)}</td><td className={b.right}>{n(a.posts)}</td>
          <td className={b.right}>{compact(a.interactions)}</td><td className={b.right}>{a.negShare === null ? "—" : `${dec(a.negShare)}%`}</td>
          <td>{note?.karakter ?? (a.kind === "publik" ? "Akun publik" : a.kind === "media" ? "Akun media" : "Akun institusi")}</td><td>{note?.tindakan ?? "—"}</td></tr>;
      })}</tbody>
    </table>
  </>);
  if (ai?.disinformasi.length) add("disinfo", 26 + table(ai.disinformasi.map((x) => [x.narasi, x.status]), [72, 30]), <>
    <H3>2.3 Narasi yang perlu diverifikasi</H3>
    <table className={b.table}>
      <thead><tr><th>Narasi yang beredar</th><th>Status</th></tr></thead>
      <tbody>{ai.disinformasi.map((x, i) => <tr key={i}><td>{x.narasi}<Refs codes={x.evidence} /></td><td>{x.status}</td></tr>)}</tbody>
    </table>
  </>);

  // ---------------------------------------------------------------- 3. issue cards
  (ai?.kartu ?? []).forEach((c, i) => {
    const issue = issueOf(c.kode);
    const res = issue?.interactions && issue.posts ? Math.round(issue.interactions / issue.posts) : null;
    const facts = [
      issue && `${n(issue.posts)} ${issue.kind === "news" ? "berita" : "unggahan"}`,
      issue?.accounts != null && `${n(issue.accounts)} akun`,
      issue?.interactions != null && `${compact(issue.interactions)} interaksi`,
      res !== null && `resonansi ${n(res)}/u`,
      issue?.emotion && `${moodInfo(issue.emotion).label}${issue.maxLevel ? ` L${issue.maxLevel}` : ""}`,
    ].filter(Boolean);
    add(`card${i}`, (i === 0 ? 62 : 0) + cardHeight(c), <>
      {i === 0 && <Section no="3" title={`Kartu isu prioritas${lens ? ` (lensa ${lens})` : ""}`} lead="Fakta ringkas → implikasi → tindakan dan tenggat." />}
      <article className={b.card}>
        <header>
          <h4><span>3.{i + 1}</span>{c.judul}</h4>
          <Tag tone={issueTone(issue)}>{issue?.kind === "news" ? "ISU BERITA" : `EWS ${issueTag(issue)}`}</Tag>
        </header>
        {facts.length > 0 && <p className={b.cardMeta}>{facts.join(" · ")}<span>Keyakinan {c.keyakinan}</span></p>}
        <div className={b.cardGrid}>
          <div><small>Fakta kunci</small><ul>{c.fakta.map((f, j) => <li key={j}>{f}</li>)}</ul></div>
          <div><small>Implikasi</small><p>{c.implikasi}<Refs codes={c.evidence} /></p></div>
        </div>
        <div className={b.action}><b>Tindakan</b><p>{c.tindakan}</p><Tag tone={/SEGERA/i.test(c.tenggat) ? "red" : "amber"}>{c.tenggat}</Tag></div>
      </article>
    </>, i === 0);
  });
  if (ai?.isuLain.length) add("others", 26 + table(ai.isuLain.map((x) => [issueOf(x.kode)?.title ?? x.kode, x.inti, x.tindakan]), [26, 34, 34]), <>
    <H3>Isu lain — ringkas</H3>
    <table className={b.table}>
      <thead><tr><th>Isu</th><th>Jenis</th><th>Inti fakta</th><th>Implikasi &amp; tindakan</th></tr></thead>
      <tbody>{ai.isuLain.map((x, i) => {
        const issue = issueOf(x.kode);
        return <tr key={i}><td className={b.strong}>{issue?.title ?? x.kode}{issue && <span className={b.muted}> · {n(issue.posts)} {issue.kind === "news" ? "berita" : "u"}</span>}</td>
          <td><Tag tone={issueTone(issue)}>{issueTag(issue)}</Tag></td><td>{x.inti}</td><td>{x.tindakan}</td></tr>;
      })}</tbody>
    </table>
  </>);

  // ---------------------------------------------------------------- 4–6. decisions, follow-up, triggers
  if (ai?.matriks.length) add("matrix", 62 + table(ai.matriks.map((x) => [x.tindakan, issueOf(x.kode)?.title.slice(0, 40) ?? ""]), [58, 26])
    + (ai.mitra.length ? 26 + table(ai.mitra.map((x) => [x.mitra, x.kebutuhan]), [20, 100]) : 0), <>
    <Section no="4" title={`Matriks keputusan${reader ? ` ${reader}` : ""}`} lead="Urutan tindakan menurut urgensi dan dampak reputasi." />
    <table className={b.table}>
      <thead><tr><th className={b.no}>#</th><th>Tindakan</th><th>Waktu</th><th>Isu</th><th className={b.right}>Prioritas</th></tr></thead>
      <tbody>{ai.matriks.map((x, i) => <tr key={i}><td className={b.no}>{i + 1}</td><td>{x.tindakan}</td><td className={b.nowrap}>{x.waktu}</td><td>{issueOf(x.kode)?.title.slice(0, 44) ?? "—"}</td><td className={b.right}><Tag tone={PRIORITY_TONE[x.prioritas]}>{x.prioritas}</Tag></td></tr>)}</tbody>
    </table>
    {ai.mitra.length > 0 && <>
      <H3>4.1 Koordinasi mitra</H3>
      <table className={b.table}>
        <thead><tr><th>Mitra</th><th>Yang dibutuhkan / ditawarkan</th></tr></thead>
        <tbody>{ai.mitra.map((x, i) => <tr key={i}><td className={b.strong}>{x.mitra}</td><td>{x.kebutuhan}</td></tr>)}</tbody>
      </table>
    </>}
  </>);
  if (ai && (ai.tindakLanjut.length || ai.kalender.length)) add("follow", 50
    + (ai.tindakLanjut.length ? 44 + table(ai.tindakLanjut.map((x) => [x.tindakan, x.catatan]), [48, 52]) : 0)
    + (ai.kalender.length ? 26 + ai.kalender.reduce((t, x) => t + 8 + (text(x.peristiwa, 100) + (x.catatan ? text(x.catatan, 110) : 0)) * LINE, 0) : 0), <>
    <Section no="5" title="Tindak lanjut & kalender momentum" />
    {ai.tindakLanjut.length > 0 && <>
      <H3>5.1 Status tindakan dari laporan sebelumnya</H3>
      <table className={b.table}>
        <thead><tr><th>Tindakan</th><th>Status</th><th>Catatan dari data</th></tr></thead>
        <tbody>{ai.tindakLanjut.map((x, i) => <tr key={i}><td>{x.tindakan}</td><td><Tag tone={FOLLOW_TONE[x.status]}>{x.status.toUpperCase()}</Tag></td><td>{x.catatan}</td></tr>)}</tbody>
      </table>
      <p className={b.muted}>Status dinilai dari pemberitaan dan unggahan periode ini; konfirmasi dengan satuan pelaksana.</p>
    </>}
    {ai.kalender.length > 0 && <>
      <H3>5.2 Kalender momentum</H3>
      <ol className={b.timeline}>{ai.kalender.map((x, i) => <li key={i}><b>{x.tanggal}</b><div><p>{x.peristiwa}</p>{x.catatan && <small>{x.catatan}</small>}</div></li>)}</ol>
    </>}
  </>);
  if (ai?.pemicu.length || ai?.evaluasi) add("triggers", (ai.pemicu.length ? 62 + table(ai.pemicu.map((x) => [x.sinyal, x.eskalasi]), [64, 18]) : 0)
    + (ai.evaluasi ? 30 + text(ai.evaluasi, 125) * LINE : 0), <>
    {ai.pemicu.length > 0 && <>
      <Section no="6" title="Pemicu pemantauan dini" lead="Sinyal yang menuntut respons dalam hitungan jam." />
      <table className={b.table}>
        <thead><tr><th className={b.no}>#</th><th>Sinyal</th><th>Isu</th><th className={b.right}>Eskalasi</th></tr></thead>
        <tbody>{ai.pemicu.map((x, i) => <tr key={i}><td className={b.no}>{i + 1}</td><td>{x.sinyal}</td><td>{x.kode?.split("+").map((c) => issueOf(c)?.title.slice(0, 30)).filter(Boolean).join(" + ") || "—"}</td><td className={`${b.right} ${b.strong}`}>{x.eskalasi}</td></tr>)}</tbody>
      </table>
    </>}
    {ai.evaluasi && <Note label="Evaluasi bulanan">{ai.evaluasi}</Note>}
  </>);
  if (ai?.prioritas.length) add("priorities", 60 + ai.prioritas.reduce((t, x) => t + 16 + text(x, 95) * 15, 0), <>
    <Section title={`${ai.prioritas.length === 3 ? "Tiga" : ai.prioritas.length} prioritas mendesak`} />
    <ol className={b.priorities}>{ai.prioritas.map((x, i) => <li key={i}><span>{i + 1}</span><p>{x}</p></li>)}</ol>
  </>);

  // ---------------------------------------------------------------- appendix
  const stale = d.platforms.filter((x) => x.lastDay && x.lastDay < d.day);
  add("method", 50 + 7 * 26 + (ai?.keterbatasan ? 30 + text(ai.keterbatasan, 125) * LINE : 0) + 26 + table(GLOSSARY.map(([a, x]) => [a, x]), [20, 110]), <>
    <Section title="Lampiran · Sumber, metodologi & keterbatasan" />
    <ul className={b.method}>
      <li><b>Data.</b> Unggahan media sosial ({d.platforms.map((x) => sourceLabel(x.source)).join(", ") || "—"}) dan berita online dari bank data Signalbase, cakupan {d.scope.name}{d.scope.keywords.length ? ` (kata kunci: ${d.scope.keywords.join(", ")})` : ""}.</li>
      <li><b>Periode.</b> {period}, {d.days === 1 ? "satu hari penuh" : `${d.days} hari penuh`} 00.00–24.00 WIB; pembanding {compareTo}.</li>
      <li><b>Emosi.</b> Label analisis otomatis; {dec(d.labelledShare ?? 0)}% unggahan media sosial periode ini berlabel.</li>
      <li><b>Isu EWS.</b> Klaster unggahan yang memicu peringatan dini; angka per isu dihitung sepanjang umur klaster.</li>
      {stale.length > 0 && <li><b>Kesenjangan data.</b> {stale.map((x) => `${sourceLabel(x.source)} (data terakhir ${dayjs(x.lastDay).locale("id").format("D MMM")})`).join(", ")}; volume platform ini dalam periode bisa lebih rendah dari kenyataan.</li>}
      <li><b>Tidak dipantau.</b> {d.notCollected.join(", ")}.</li>
      <li><b>Narasi analisis.</b> Disusun AI dari angka dan sampel{ai ? "" : " (tidak tersedia untuk laporan ini)"}; fakta dari pemberitaan perlu verifikasi analis sebelum menjadi dasar tindakan.</li>
    </ul>
    {ai?.keterbatasan && <Note label="Keterbatasan" tone="amber">{ai.keterbatasan}</Note>}
    <H3>Glosarium</H3>
    <table className={b.table}><tbody>{GLOSSARY.map(([term, def]) => <tr key={term}><td className={b.strong}>{term}</td><td>{def}</td></tr>)}</tbody></table>
  </>);
  const refs = [...refNo].map(([code, no]) => ({ no, ...d.sources[code] }));
  if (refs.length) add("refs", 40 + refs.reduce((t, x) => t + 6 + text(`${x.label} ${x.url ?? ""}`, 120) * 12, 0), <>
    <H3>Daftar sumber</H3>
    <ol className={b.refs}>{refs.map((x) => <li key={x.no}><span>[{x.no}]</span><p>{x.label}{x.url && <> · <a href={x.url}>{x.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 70)}</a></>}</p></li>)}</ol>
  </>);

  // Fill pages in order; a block that does not fit (or asks for a fresh page) starts the next one.
  const pages: Block[][] = [];
  for (const blk of blocks) {
    const current = pages[pages.length - 1];
    const used = current ? current.reduce((t, x) => t + x.h + GAP, 0) : 0;
    if (!current || blk.page || used + blk.h > CAP) pages.push([blk]); else current.push(blk);
  }
  const total = pages.length + 1;
  const runTitle = `Laporan Eksekutif ${kindLabel} · ${period}`;

  return (
    <>
      <section className={`${b.page} ${b.cover}`} data-report-page>
        <div className={b.coverBand}>
          <div className={b.coverTop}>
            <span className={b.coverBrand}><LogoMark size={24} />Signal<b>base</b></span>
            <span className={b.coverSifat}>SIFAT: {sifat}</span>
          </div>
          <div className={b.coverTitle}>
            <small>Laporan eksekutif · {kindLabel}</small>
            <h1>Intelijen Isu Publik</h1>
            <h2>{subject}</h2>
            <p>{period}</p>
          </div>
        </div>
        <div className={b.coverBody}>
          <div className={b.coverStatus} data-tone={HEAT_TONE[heat]}>
            <small>Status periode</small>
            <b>Suhu isu {heat.toLowerCase()}</b>
            {ai && <span>Momentum {ai.suhu.momentum.toLowerCase()}</span>}
          </div>
          <dl className={b.coverKpi}>
            <div><dt>Unggahan</dt><dd>{compact(k.posts.now)}</dd><Delta m={k.posts} /></div>
            <div><dt>Interaksi</dt><dd>{compact(k.interactions.now)}</dd><Delta m={k.interactions} /></div>
            <div><dt>Artikel online</dt><dd>{compact(k.news.now)}</dd><Delta m={k.news} /></div>
            <div><dt>Isu EWS</dt><dd>{k.ews.now}</dd><span className={b.delta}>{k.critical} critical</span></div>
          </dl>
          <table className={b.coverMeta}>
            <tbody>
              {p.recipientTitle && <tr><th>Untuk</th><td><b>{p.recipientTitle}</b>{p.recipientName && <><br />{p.recipientName}</>}</td></tr>}
              {lens && <tr><th>Sudut pandang</th><td>Keputusan operasional &amp; reputasi {lens}</td></tr>}
              <tr><th>Cakupan data</th><td>{d.scope.name}{d.scope.keywords.length ? ` · ${d.scope.keywords.slice(0, 6).join(", ")}` : ""}</td></tr>
              <tr><th>Periode data</th><td>{period} · {d.days === 1 ? "satu hari penuh" : `${d.days} hari penuh`}, 00.00–24.00 WIB</td></tr>
              <tr><th>Nomor dokumen</th><td>{d.number}</td></tr>
              <tr><th>Disusun</th><td>{at.format("dddd, D MMMM YYYY · HH.mm")} WIB · Signalbase (otomatis)</td></tr>
              <tr><th>Klasifikasi</th><td className={b.red}>{sifat}</td></tr>
            </tbody>
          </table>
        </div>
        <footer className={b.coverFoot}>
          <span>Sistem pendukung keputusan · Disusun otomatis dari bank data media sosial dan media online Signalbase.</span>
          <span>Tinjau bersama analis sebelum menjadi dasar tindakan.</span>
        </footer>
      </section>
      {pages.map((page, i) => (
        <section key={page[0].key} className={b.page} data-report-page>
          <header className={b.run}><span><b>Signalbase</b> · {runTitle}</span><span className={b.red}>{sifat}</span></header>
          <div className={b.body}>{page.map((x) => <div key={x.key} className={b.block}>{x.node}</div>)}</div>
          <footer className={b.foot}><span>No. {d.number}</span><span>{subject}</span><span>{i + 2} / {total}</span></footer>
        </section>
      ))}
    </>
  );
}
