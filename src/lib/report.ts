// Shared by the report page (/laporan) and its API: the data the printed executive report is built from.
import type { Insights } from "./media/insights";
import { formatNumber, sourceLabel } from "./media/labels";
import type { MoodCount } from "./media/types";
import type { OntIssue } from "./ontologi";

export const REPORT_PERIODS = [1, 3, 7] as const;
export type ReportDays = (typeof REPORT_PERIODS)[number];
export const isReportDays = (n: number): n is ReportDays => (REPORT_PERIODS as readonly number[]).includes(n);
export const DEFAULT_SIFAT = "RAHASIA / TERBATAS";
export const REPORT_ISSUES = 8;

export type ReportData = {
  days: ReportDays; at: string;
  project: { name: string; keywords: string[] } | null;
  social: { insights: Insights; moods: MoodCount[] } | null;
  online: { insights: Insights; moods: MoodCount[] } | null;
  issues: OntIssue[];
};

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
