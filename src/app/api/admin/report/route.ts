import { NextResponse } from "next/server";
import { parseKeyScope } from "@/lib/media/keyScope";
import { isReportDays, MAX_REPORT_PROJECTS, type ReportData, type ReportSection } from "@/lib/report";
import { adminRoute } from "@/lib/server/auth";
import { sourceErrorResponse } from "@/lib/server/bank/errors";
import { overviewView } from "@/lib/server/overviewKey";
import { reportSection } from "@/lib/server/report";

// Custom executive report, the hours up to now: ?days=1|3|7[&key=<project id>|all]. Same key rules as /api/admin/stats;
// key=all is the whole bank for an admin and one section per own project (up to MAX_REPORT_PROJECTS) for a user.
// The daily archive reports are stored snapshots, see /api/admin/reports.
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
  try {
    const sections: ReportSection[] = [];
    if (multi) {
      for (const k of view.keys.slice(0, MAX_REPORT_PROJECTS)) sections.push(await reportSection(parseKeyScope(k.scope, k.keywords), { name: k.name, keywords: k.keywords }, days, { newsIssues: false }));
    } else {
      sections.push(await reportSection(view.scope, view.key ? { name: view.key.name, keywords: view.key.keywords } : null, days, { newsIssues: true }));
    }
    const data: ReportData = { days, at: new Date().toISOString(), mode: sections.length > 1 ? "multi" : sections[0].project ? "project" : "bank", sections };
    return NextResponse.json(data);
  } catch (e) {
    return sourceErrorResponse(e, "laporan");
  }
});
