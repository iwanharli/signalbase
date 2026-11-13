import { NextResponse } from "next/server";
import { summaryContentSchema, type SummaryResponse } from "@/lib/ai/summary";
import { BANK_SCOPE, dataDay, getSetting } from "@/lib/server/ai/summary";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { overviewView } from "@/lib/server/overviewKey";

const HISTORY_DAYS = 30;

// Ringkasan AI of the scope the Ringkasan / Beranda page is looking through (same ?key= rules as /api/admin/stats).
// Each summary covers one complete data day (normally yesterday). ?day=YYYY-MM-DD picks an earlier one (default: the newest).
export const GET = adminRoute(async (req: Request, _ctx, _username, user) => {
  const view = await overviewView(req, user);
  if (view instanceof Response) return view;
  const setting = await getSetting();
  const scope = view.key?.id ?? BANK_SCOPE;
  const requested = new URL(req.url).searchParams.get("day");
  const days = view.noKey ? [] : (await prisma.aiSummary.findMany({
    where: { scope }, orderBy: { day: "desc" }, take: HISTORY_DAYS, select: { day: true },
  })).map((r) => r.day);
  const day = requested && days.includes(requested) ? requested : days[0];
  const row = day ? await prisma.aiSummary.findUnique({ where: { scope_day: { scope, day } } }) : null;
  const content = row?.content ? summaryContentSchema.safeParse(row.content) : null;
  const body: SummaryResponse = {
    summary: row ? {
      day: row.day, status: row.status === "ok" ? "ok" : "failed", content: content?.success ? content.data : null,
      // Users see a generic message; provider errors are for admins.
      error: row.error ? (user.role === "admin" ? row.error : "Ringkasan belum dapat dibuat.") : null,
      model: row.model, updatedAt: row.updatedAt.toISOString(),
    } : null,
    days, latest: dataDay(), hour: setting?.summaryHour ?? 6,
    configured: !!setting?.providerKeyEnc, enabled: !!setting?.summaryEnabled,
  };
  return NextResponse.json(body);
});
