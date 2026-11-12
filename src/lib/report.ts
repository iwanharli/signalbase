// Shared by the report page (/laporan) and its API: the data the printed executive report is built from.
import dayjs from "dayjs";
import type { Insights } from "./media/insights";
import { formatNumber, sourceLabel } from "./media/labels";
import type { MoodCount } from "./media/types";
import type { IssueSummary } from "./issues";
import type { OntIssue } from "./ontologi";

export const REPORT_PERIODS = [1, 3, 7] as const;
export type ReportDays = (typeof REPORT_PERIODS)[number];
export const isReportDays = (n: number): n is ReportDays => (REPORT_PERIODS as readonly number[]).includes(n);
export const DEFAULT_SIFAT = "RAHASIA / TERBATAS";
export const REPORT_ISSUES = 8;
export const REPORT_NEWS_ISSUES = 8;

/** One project's (or the whole bank's) numbers. `project` is null for the whole bank. */
export type ReportSection = {
  project: { name: string; keywords: string[] } | null;
  social: { insights: Insights; moods: MoodCount[] } | null;
  online: { insights: Insights; moods: MoodCount[] } | null;
  issues: OntIssue[];
  /** Online news issues; empty in a combined multi-project report. */
  newsIssues: IssueSummary[];
};
/** bank = whole bank (admin), project = one project, multi = one section per project of a user. */
export type ReportData = { days: ReportDays; at: string; mode: "bank" | "project" | "multi"; sections: ReportSection[] };

/** Most projects in one combined report: each one costs its own source-database queries. */
export const MAX_REPORT_PROJECTS = 5;

/** The name printed on the cover. */
export const reportTitle = (d: Pick<ReportData, "mode" | "sections">) =>
  d.mode === "bank" ? "SELURUH DATA" : d.mode === "multi" ? "SEMUA PROYEK" : (d.sections[0]?.project?.name ?? "").toUpperCase();

/** Overall heat from the early-warning issues: any Critical = Tinggi, any High = Waspada, otherwise Terkendali. */
export function issueHeat(issues: OntIssue[]): { label: string; color: string } {
  if (issues.some((i) => i.level === "Critical")) return { label: "TINGGI", color: "#e11d48" };
  if (issues.some((i) => i.level === "High")) return { label: "WASPADA", color: "#ea580c" };
  return { label: "TERKENDALI", color: "#16a34a" };
}

/** Change from the previous period as a signed percentage; null when there was nothing before. */
export const changePct = (now: number, before: number) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);

/** A short paragraph from the period's numbers, for where a chart has no data (e.g. no post carries an emotion label yet). */
export function narrative(type: "social" | "online", ins: Insights): string {
  const { current: c, previous: p } = ins;
  const unit = type === "social" ? "unggahan" : "berita";
  if (!c.total) return `Tidak ada ${unit} yang tercatat pada ${ins.period} hari terakhir.`;
  const change = changePct(c.total, p.total);
  const parts = [`Tercatat ${formatNumber(c.total)} ${unit} dalam ${ins.period} hari terakhir${change === null ? "" : `, ${change >= 0 ? "naik" : "turun"} ${Math.abs(change)}% dibanding periode sebelumnya`}.`];
  parts.push(c.labelled ? `${Math.round((c.labelled / c.total) * 100)}% di antaranya sudah berlabel emosi.` : "Belum ada yang berlabel emosi, sehingga sebaran emosi belum dapat dibaca.");
  const cat = ins.categories[0];
  if (cat) parts.push(`Kategori terbanyak adalah ${cat.value} (${formatNumber(cat.n)}).`);
  const acc = ins.accounts?.[0];
  if (acc) parts.push(`Akun paling aktif: ${acc.name ?? acc.username} di ${sourceLabel(acc.source)} dengan ${formatNumber(acc.n)} unggahan.`);
  const media = ins.media?.[0];
  if (media) parts.push(`Media paling banyak memberitakan: ${sourceLabel(media.source)} (${formatNumber(media.n)} berita).`);
  return parts.join(" ");
}

export type Counted = { name: string; n: number };
const countNames = (names: string[], top: number): Counted[] => {
  const seen = new Map<string, Counted>();
  for (const raw of names) {
    const name = raw.replace(/\s+/g, " ").trim(), key = name.toLowerCase();
    if (!name) continue;
    const hit = seen.get(key);
    if (hit) hit.n++; else seen.set(key, { name, n: 1 });
  }
  return [...seen.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).slice(0, top);
};
/** Actors or targets named by the most issues (an issue counts once per name). */
export const entityRanking = (issues: OntIssue[], role: "actors" | "targets", top = 8) => countNames(issues.flatMap((i) => [...new Set(i[role].map((x) => x.trim().toLowerCase()))].map((k) => i[role].find((x) => x.trim().toLowerCase() === k)!)), top);
/** Places named by the most issues. */
export const locationRanking = (issues: OntIssue[], top = 8) => countNames(issues.flatMap((i) => (i.location ? [i.location] : [])), top);

/** The closing paragraph: scope, volume, heat and the top issue, from the same numbers as the report. */
export function closingNarrative(d: Pick<ReportData, "days" | "mode" | "sections">): string {
  const parts = d.sections.flatMap((x) => [x.social, x.online]).flatMap((v) => (v ? [v.insights.current.total] : []));
  const volume = parts.reduce((a, b) => a + b, 0);
  const issues = d.sections.flatMap((x) => x.issues);
  const scope = d.mode === "bank" ? "semua data" : d.mode === "multi" ? `${d.sections.length} proyek` : `proyek ${d.sections[0]?.project?.name}`;
  const heat = issueHeat(issues).label.toLowerCase();
  const critical = issues.filter((i) => i.level === "Critical").length, high = issues.filter((i) => i.level === "High").length;
  const top = [...issues].sort((a, b) => b.score - a.score)[0];
  return [
    `Laporan ini merangkum ${formatNumber(volume)} unggahan dan berita dari ${scope} dalam ${d.days} hari terakhir.`,
    issues.length ? `Suhu isu berada pada tingkat ${heat}, dengan ${critical} isu Critical dan ${high} isu High yang perlu dicermati.` : "Tidak ada isu peringatan dini pada periode ini; situasi dinilai terkendali.",
    top ? `Isu dengan skor tertinggi: “${top.title}”.` : "",
    "Angka akan terus bergerak, sehingga pemantauan berkelanjutan dan penilaian analis tetap diperlukan sebelum keputusan diambil.",
  ].filter(Boolean).join(" ");
}

/** The name the browser proposes when the page is saved as PDF (it comes from the page title): kind, scope, period and when it was made. */
export function reportFileName(d: Pick<ReportData, "days" | "mode" | "sections" | "at">): string {
  const scope = d.mode === "bank" ? "Semua Data" : d.mode === "multi" ? "Semua Proyek" : (d.sections[0]?.project?.name ?? "Proyek");
  return `Laporan Eksekutif - ${scope} - ${d.days} hari - ${dayjs(d.at).format("YYYYMMDD-HHmmss")}`.replace(/[\\/:*?"<>|]/g, "");
}
