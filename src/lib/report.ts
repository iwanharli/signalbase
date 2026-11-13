// Shared by the report page (/laporan) and its API: the data the printed executive report is built from.
import dayjs from "dayjs";
import "dayjs/locale/id";
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
  /** Early-warning issues in the whole period before the list was cut to the top ones (archive reports). */
  issueCount?: number; criticalCount?: number;
};
/** Archive reports: one day, Monday-Sunday, or a calendar month, each written once the period is over. */
export const REPORT_KINDS = ["harian", "mingguan", "bulanan"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
export const isReportKind = (k: string | null): k is ReportKind => (REPORT_KINDS as readonly string[]).includes(k ?? "");
export const KIND_LABEL: Record<ReportKind, string> = { harian: "Harian", mingguan: "Mingguan", bulanan: "Bulanan" };

/**
 * bank = whole bank (admin), project = one project, multi = one section per project of a user. `days` is the length of the
 * period. Archive reports also carry `kind` and their whole calendar days `start`..`day` (YYYY-MM-DD); a custom report
 * has neither and covers the hours up to `at`.
 */
export type ReportData = { days: number; at: string; mode: "bank" | "project" | "multi"; sections: ReportSection[]; kind?: ReportKind; start?: string; day?: string };

const DAY_MS = 86_400_000;
/** The calendar date `offset` days from `day` (YYYY-MM-DD). */
export const shiftDay = (day: string, offset: number) => new Date(Date.parse(`${day}T12:00:00Z`) + offset * DAY_MS).toISOString().slice(0, 10);

/**
 * The newest complete period of a kind, given yesterday (the newest complete day): harian is yesterday, mingguan the
 * Monday-Sunday week ending on or before it, bulanan the calendar month ending on or before it.
 */
export function latestPeriod(kind: ReportKind, yesterday: string): { start: string; end: string } {
  if (kind === "harian") return { start: yesterday, end: yesterday };
  if (kind === "mingguan") {
    const weekday = new Date(`${yesterday}T12:00:00Z`).getUTCDay(); // 0 = Sunday
    const end = shiftDay(yesterday, -weekday);
    return { start: shiftDay(end, -6), end };
  }
  const tomorrow = shiftDay(yesterday, 1);
  // Yesterday closed its month when today is the 1st; otherwise the last complete month is the one before.
  const end = tomorrow.endsWith("-01") ? yesterday : shiftDay(`${yesterday.slice(0, 7)}-01`, -1);
  return { start: `${end.slice(0, 7)}-01`, end };
}

/** ISO week number of a Monday (YYYY-MM-DD): weeks start on Monday and week 1 holds the year's first Thursday. */
export function weekOfYear(monday: string) {
  const day = 86_400_000;
  const thursday = Date.parse(`${monday}T00:00:00Z`) + 3 * day;
  const jan4 = Date.UTC(new Date(thursday).getUTCFullYear(), 0, 4);
  const firstThursday = jan4 + (3 - ((new Date(jan4).getUTCDay() + 6) % 7)) * day;
  return 1 + Math.round((thursday - firstThursday) / (7 * day));
}

/** Number of calendar days from `start` to `end`, inclusive. */
export const daysBetween = (start: string, end: string) => Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / DAY_MS) + 1;

/** "12 November 2026", "6–12 November 2026", "1 Oktober – 31 Oktober 2026"; the custom report's span is "N hari terakhir". */
export function periodLabel(d: Pick<ReportData, "days" | "start" | "day">): string {
  if (!d.day) return `${d.days} hari terakhir`;
  const end = dayjs(d.day).locale("id"), start = dayjs(d.start ?? d.day).locale("id");
  if (start.isSame(end, "day")) return end.format("D MMMM YYYY");
  if (start.isSame(end, "month")) return `${start.format("D")}–${end.format("D MMMM YYYY")}`;
  return `${start.format("D MMMM")} – ${end.format("D MMMM YYYY")}`;
}

/** The few numbers an archive card shows on its cover, computed once when the daily report is saved. */
export type ReportCover = {
  social: number | null; online: number | null;
  /** Negative share of labelled items, 0-100; null when the type is out of scope or nothing is labelled. */
  negSocial: number | null; negOnline: number | null;
  issues: number; critical: number; heat: string; heatColor: string;
  /** Change in total volume against the day before, in percent; null without a day before. */
  change: number | null;
};

export function reportCover(d: ReportData): ReportCover {
  const x = d.sections[0];
  const neg = (v: ReportSection["social"]) => (v && v.insights.current.labelled ? Math.round((v.insights.current.neg / v.insights.current.labelled) * 100) : null);
  const now = (x.social?.insights.current.total ?? 0) + (x.online?.insights.current.total ?? 0);
  const before = (x.social?.insights.previous.total ?? 0) + (x.online?.insights.previous.total ?? 0);
  const heat = issueHeat(x.issues);
  return {
    social: x.social?.insights.current.total ?? null, online: x.online?.insights.current.total ?? null,
    negSocial: neg(x.social), negOnline: neg(x.online),
    issues: x.issueCount ?? x.issues.length, critical: x.criticalCount ?? x.issues.filter((i) => i.level === "Critical").length,
    heat: heat.label, heatColor: heat.color, change: changePct(now, before),
  };
}

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
export function closingNarrative(d: Pick<ReportData, "days" | "mode" | "sections" | "day" | "start">): string {
  const parts = d.sections.flatMap((x) => [x.social, x.online]).flatMap((v) => (v ? [v.insights.current.total] : []));
  const volume = parts.reduce((a, b) => a + b, 0);
  const issues = d.sections.flatMap((x) => x.issues);
  const scope = d.mode === "bank" ? "semua data" : d.mode === "multi" ? `${d.sections.length} proyek` : `proyek ${d.sections[0]?.project?.name}`;
  const heat = issueHeat(issues).label.toLowerCase();
  const critical = issues.filter((i) => i.level === "Critical").length, high = issues.filter((i) => i.level === "High").length;
  const top = [...issues].sort((a, b) => b.score - a.score)[0];
  return [
    `Laporan ini merangkum ${formatNumber(volume)} unggahan dan berita dari ${scope} ${d.day ? `pada periode ${periodLabel(d)}` : `dalam ${d.days} hari terakhir`}.`,
    issues.length ? `Suhu isu berada pada tingkat ${heat}, dengan ${critical} isu Critical dan ${high} isu High yang perlu dicermati.` : "Tidak ada isu peringatan dini pada periode ini; situasi dinilai terkendali.",
    top ? `Isu dengan skor tertinggi: “${top.title}”.` : "",
    "Angka akan terus bergerak, sehingga pemantauan berkelanjutan dan penilaian analis tetap diperlukan sebelum keputusan diambil.",
  ].filter(Boolean).join(" ");
}

/** The name the browser proposes when the page is saved as PDF (it comes from the page title): kind, scope, period and when it was made. */
export function reportFileName(d: Pick<ReportData, "days" | "mode" | "sections" | "at" | "day" | "start" | "kind">): string {
  const scope = d.mode === "bank" ? "Semua Data" : d.mode === "multi" ? "Semua Proyek" : (d.sections[0]?.project?.name ?? "Proyek");
  const when = d.day ? `${KIND_LABEL[d.kind ?? "harian"]} ${d.start && d.start !== d.day ? `${d.start} sd ${d.day}` : d.day}` : `${d.days} hari - ${dayjs(d.at).format("YYYYMMDD-HHmmss")}`;
  return `Laporan Eksekutif - ${scope} - ${when}`.replace(/[\\/:*?"<>|]/g, "");
}
