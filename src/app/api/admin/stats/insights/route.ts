import { NextResponse } from "next/server";
import { isInsightPeriod } from "@/lib/media/insights";
import { isMediaType } from "@/lib/media/types";
import { adminRoute } from "@/lib/server/auth";
import { sourceErrorResponse } from "@/lib/server/bank/errors";
import { typeInsights } from "@/lib/server/insights";
import { overviewView } from "@/lib/server/overviewKey";

// Ringkasan "Analisis periode": ?type=social|online&days=7|14|30[&key=]. Same key rules as /api/admin/stats.
// { insights: null } when the key's scope leaves the type out.
export const GET = adminRoute(async (req: Request, _ctx, _username, user) => {
  const params = new URL(req.url).searchParams;
  const type = params.get("type") ?? "";
  const days = Number(params.get("days") ?? 7);
  if (!isMediaType(type) || !isInsightPeriod(days)) return NextResponse.json({ error: "Parameter tidak valid" }, { status: 400 });
  const view = await overviewView(req, user);
  if (view instanceof Response) return view;
  if (view.noKey) return NextResponse.json({ insights: null });
  try {
    return NextResponse.json({ insights: await typeInsights(type, days, view.scope) });
  } catch (e) {
    return sourceErrorResponse(e, "insights");
  }
});
