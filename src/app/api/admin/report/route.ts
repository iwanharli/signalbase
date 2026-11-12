import { NextResponse } from "next/server";
import { parseKeyScope, type KeyScope } from "@/lib/media/keyScope";
import type { MediaType } from "@/lib/media/types";
import { isReportDays, MAX_REPORT_PROJECTS, REPORT_ISSUES, REPORT_NEWS_ISSUES, type ReportData, type ReportSection } from "@/lib/report";
import { adminRoute } from "@/lib/server/auth";
import { sourceErrorResponse } from "@/lib/server/bank/errors";
import { listIssues } from "@/lib/server/bank/issues";
import { ontologiIssues } from "@/lib/server/bank/ontologi";
import { typeInsights } from "@/lib/server/insights";
import { typeStats } from "@/lib/server/overview";
import { overviewView } from "@/lib/server/overviewKey";

// Executive report data: ?days=1|3|7[&key=<project id>|all]. Same key rules as /api/admin/stats; key=all is the whole bank
// for an admin and one section per own project (up to MAX_REPORT_PROJECTS) for a user.
export const GET = adminRoute(async (req: Request, _ctx, _username, user) => {
  const url = new URL(req.url);
  const days = Number(url.searchParams.get("days") ?? 1);
  if (!isReportDays(days)) return NextResponse.json({ error: "days harus 1, 3, atau 7" }, { status: 400 });
  const all = url.searchParams.get("key") === "all";
  if (all) url.searchParams.delete("key");
  const view = await overviewView(all ? new Request(url) : req, user);
  if (view instanceof Response) return view;
  if (view.noKey) return NextResponse.json({ error: "Belum ada proyek" }, { status: 404 });

  const multi = all && user.role === "user";
  const section = async (scope: KeyScope | undefined, project: ReportSection["project"]): Promise<ReportSection> => {
    const part = async (type: MediaType) => {
      const [insights, stats] = await Promise.all([typeInsights(type, days, scope), typeStats(type, scope, days)]);
      return insights && stats ? { insights, moods: stats.moods } : null;
    };
    const [social, online, issues, news] = await Promise.all([part("social"), part("online"), ontologiIssues(days, scope), multi ? [] : listIssues(days, scope?.keywords ?? [], "nasional")]);
    return { project, social, online, issues: issues.slice(0, REPORT_ISSUES), newsIssues: news.slice(0, REPORT_NEWS_ISSUES) };
  };
  try {
    const sections: ReportSection[] = [];
    if (multi) {
      for (const k of view.keys.slice(0, MAX_REPORT_PROJECTS)) sections.push(await section(parseKeyScope(k.scope, k.keywords), { name: k.name, keywords: k.keywords }));
    } else {
      sections.push(await section(view.scope, view.key ? { name: view.key.name, keywords: view.key.keywords } : null));
    }
    const data: ReportData = { days, at: new Date().toISOString(), mode: sections.length > 1 ? "multi" : sections[0].project ? "project" : "bank", sections };
    return NextResponse.json(data);
  } catch (e) {
    return sourceErrorResponse(e, "laporan");
  }
});
