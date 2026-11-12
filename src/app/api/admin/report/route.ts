import { NextResponse } from "next/server";
import type { MediaType } from "@/lib/media/types";
import { isReportDays, REPORT_ISSUES, type ReportData } from "@/lib/report";
import { adminRoute } from "@/lib/server/auth";
import { sourceErrorResponse } from "@/lib/server/bank/errors";
import { ontologiIssues } from "@/lib/server/bank/ontologi";
import { typeInsights } from "@/lib/server/insights";
import { typeStats } from "@/lib/server/overview";
import { overviewView } from "@/lib/server/overviewKey";

// Executive report data: ?days=1|3|7[&key=]. Same key rules as /api/admin/stats.
export const GET = adminRoute(async (req: Request, _ctx, _username, user) => {
  const days = Number(new URL(req.url).searchParams.get("days") ?? 1);
  if (!isReportDays(days)) return NextResponse.json({ error: "days harus 1, 3, atau 7" }, { status: 400 });
  const view = await overviewView(req, user);
  if (view instanceof Response) return view;
  if (view.noKey) return NextResponse.json({ error: "Belum ada proyek" }, { status: 404 });
  try {
    const part = async (type: MediaType) => {
      const [insights, stats] = await Promise.all([typeInsights(type, days, view.scope), typeStats(type, view.scope, days)]);
      return insights && stats ? { insights, moods: stats.moods } : null;
    };
    const [social, online, issues] = await Promise.all([part("social"), part("online"), ontologiIssues(days, view.scope)]);
    const data: ReportData = {
      days, at: new Date().toISOString(), project: view.key ? { name: view.key.name, keywords: view.key.keywords } : null,
      social, online, issues: issues.slice(0, REPORT_ISSUES),
    };
    return NextResponse.json(data);
  } catch (e) {
    return sourceErrorResponse(e, "laporan");
  }
});
