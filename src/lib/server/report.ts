// Executive report data. A section is the whole bank or one project. The custom report (/api/admin/report) builds it for
// the hours up to now; the archive for whole calendar days ending on a given day. Once a period is over the worker writes
// its report for every scope (runScheduledReports): harian every morning, mingguan on Monday, bulanan on the 1st. They
// are stored as snapshots, so the archive opens without touching the source database.
import type { Prisma } from "@prisma/client";
import { OPEN_SCOPE, parseKeyScope, type KeyScope } from "@/lib/media/keyScope";
import type { MediaType } from "@/lib/media/types";
import { ONT_PERIODS } from "@/lib/ontologi";
import { heatColor, type BriefData, type BriefProfile } from "@/lib/brief";
import {
  changePct, daysBetween, DEFAULT_SIFAT, latestPeriod, REPORT_ISSUES, REPORT_KINDS, REPORT_NEWS_ISSUES,
  type ReportCover, type ReportKind, type ReportSection,
} from "@/lib/report";
import { getSetting } from "./ai/summary";
import { buildBrief, heatOf } from "./brief";
import { moodBreakdown } from "./bank";
import { listIssues } from "./bank/issues";
import { ontologiIssues } from "./bank/ontologi";
import { prisma } from "./db";
import { typeInsights } from "./insights";
import { typeStats } from "./overview";

export const BANK_SCOPE = "bank";
const BANK_NAME = "Seluruh data";
/** Jakarta hour from which finished periods are written; the source has had the night to catch up with late posts. */
const REPORT_HOUR = 6;
/** A report that failed is tried again after this long, not on every tick. */
const RETRY_MS = 20 * 60_000;
const DAY_MS = 86_400_000;

const jakartaDay = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
const jakartaHour = () => Number(new Date().toLocaleString("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", hour12: false }));
/** The calendar date a source timestamp falls on. node-pg reads zone-less timestamps as local time, so local getters give back the stored wall clock. */
const wallDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * One report section. Without `period`: the `days` days up to now. With `period`: those whole calendar days, the
 * early-warning issues sent in them and the news issues active in them.
 */
export async function reportSection(scope: KeyScope | undefined, project: ReportSection["project"], days: number,
  opts: { period?: { start: string; end: string }; newsIssues: boolean }): Promise<ReportSection> {
  const { period } = opts;
  const part = async (type: MediaType) => {
    const insights = await typeInsights(type, days, scope, period?.end);
    if (!insights) return null;
    const moods = period
      ? await moodBreakdown(type, new URLSearchParams({ from: period.start, to: period.end }), scope ?? OPEN_SCOPE)
      : (await typeStats(type, scope, days))?.moods ?? [];
    return { insights, moods };
  };
  // The issue lists count back from today, so an older period needs a longer reach.
  const back = period ? daysBetween(period.start, jakartaDay()) : days;
  const ontDays = ONT_PERIODS.find((p) => p.days >= back)?.days ?? 30;
  const [social, online, issues, news] = await Promise.all([
    part("social"), part("online"),
    ontologiIssues(ontDays, scope),
    opts.newsIssues ? listIssues(back, scope?.keywords ?? [], "nasional") : Promise.resolve([]),
  ]);
  const inPeriod = (from: string, to: string) => !period || (from <= period.end && to >= period.start);
  const ews = issues.filter((i) => inPeriod(wallDay(i.sentAt), wallDay(i.sentAt)));
  return {
    project, social, online,
    issues: ews.slice(0, REPORT_ISSUES), issueCount: ews.length, criticalCount: ews.filter((i) => i.level === "Critical").length,
    newsIssues: news.filter((i) => inPeriod(wallDay(i.firstSeenAt), wallDay(i.lastSeenAt))).slice(0, REPORT_NEWS_ISSUES),
  };
}

type ScopeRef = { id: string; name: string; scope: KeyScope | undefined; project: ReportSection["project"] };

/** The bank and every active project: the scopes that get archive reports. */
export async function reportScopes(): Promise<ScopeRef[]> {
  const keys = await prisma.apiKey.findMany({ where: { revokedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, scope: true, keywords: true } });
  return [
    { id: BANK_SCOPE, name: BANK_NAME, scope: undefined, project: null },
    ...keys.map((k) => ({ id: k.id, name: k.name, scope: parseKeyScope(k.scope, k.keywords), project: { name: k.name, keywords: k.keywords } })),
  ];
}

const DEFAULT_PROFILE: BriefProfile = { recipientTitle: "", recipientName: "", institution: "", region: "", partners: [], sifat: DEFAULT_SIFAT };

/** Who a scope's reports are written for; empty fields when no profile was saved yet. */
export async function reportProfile(scope: string): Promise<BriefProfile> {
  const row = await prisma.reportProfile.findUnique({ where: { scope } });
  return row ? { recipientTitle: row.recipientTitle, recipientName: row.recipientName, institution: row.institution, region: row.region, partners: row.partners, sifat: row.sifat || DEFAULT_SIFAT } : DEFAULT_PROFILE;
}

/** The archive card numbers of a brief. */
export function briefCover(d: BriefData): ReportCover {
  const k = d.kpi, heat = heatOf(d);
  const now = k.posts.now + k.news.now, before = (k.posts.prev ?? 0) + (k.news.prev ?? 0);
  return {
    social: k.posts.now, online: k.news.now, negSocial: k.negShare.now, negOnline: null,
    issues: k.ews.now, critical: k.critical, heat, heatColor: heatColor(heat), change: changePct(now, before),
  };
}

/** Builds and stores (or replaces) one scope's executive brief of one finished period. */
export async function writeReport(ref: ScopeRef, kind: ReportKind, period: { start: string; end: string }) {
  const data = await buildBrief({ id: ref.id, name: ref.name, scope: ref.scope, keywords: ref.project?.keywords ?? [] }, kind, period, await reportProfile(ref.id));
  const json = { data: data as unknown as Prisma.InputJsonValue, cover: briefCover(data) as unknown as Prisma.InputJsonValue };
  return prisma.archivedReport.upsert({
    where: { scope_kind_start: { scope: ref.id, kind, start: period.start } },
    create: { scope: ref.id, scopeName: ref.name, kind, start: period.start, day: period.end, ...json },
    update: { scopeName: ref.name, day: period.end, ...json },
  });
}

/** Last failure per report in this process, so a failing one waits RETRY_MS before it is tried again. */
const failedAt = new Map<string, number>();

/** Called every worker tick: from REPORT_HOUR on, writes the newest finished period of each kind for every scope that lacks it. */
export async function runScheduledReports() {
  if (jakartaHour() < REPORT_HOUR) return 0;
  // A report written now is kept as is, so wait for the AI provider rather than archive numbers-only reports.
  if (!(await getSetting())?.providerKeyEnc) return 0;
  const yesterday = jakartaDay(new Date(Date.now() - DAY_MS));
  const scopes = await reportScopes();
  let written = 0;
  for (const kind of REPORT_KINDS) {
    const period = latestPeriod(kind, yesterday);
    const done = new Set((await prisma.archivedReport.findMany({ where: { kind, start: period.start }, select: { scope: true } })).map((r) => r.scope));
    for (const ref of scopes) {
      const key = `${ref.id}|${kind}|${period.start}`;
      if (done.has(ref.id) || Date.now() - (failedAt.get(key) ?? 0) < RETRY_MS) continue;
      try {
        await writeReport(ref, kind, period);
        written++;
      } catch (error) {
        failedAt.set(key, Date.now());
        console.warn(`[laporan] ${kind} ${ref.name} ${period.start}..${period.end} gagal:`, (error as Error).message);
      }
    }
  }
  return written;
}
