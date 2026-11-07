import { NextResponse } from "next/server";
import { usageBuckets } from "@/lib/server/ai/balance";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";

type Context = { params: Promise<{ id: string }> };
const HOUR = 3_600_000, DAY = 24 * HOUR;
/** Range in days -> bucket size: hourly for a day, otherwise daily. */
const RANGES: Record<string, { days: number; bucketMs: number }> = {
  "1": { days: 1, bucketMs: HOUR }, "7": { days: 7, bucketMs: DAY }, "30": { days: 30, bucketMs: DAY }, "90": { days: 90, bucketMs: DAY },
};

// Provider credit spent per hour/day, derived from recorded balance snapshots.
export const GET = adminRoute(async (req: Request, { params }: Context) => {
  const { id } = await params;
  const range = RANGES[new URL(req.url).searchParams.get("days") ?? "7"] ?? RANGES["7"];
  const to = new Date();
  // Align daily buckets to local midnight (Asia/Jakarta, UTC+7) so bars read as calendar days.
  const offset = 7 * HOUR;
  const end = range.bucketMs === DAY ? Math.ceil((to.getTime() + offset) / DAY) * DAY - offset : Math.ceil(to.getTime() / HOUR) * HOUR;
  const from = new Date(end - range.days * DAY);

  const latest = await prisma.balanceSnapshot.findFirst({ where: { apiKeyId: id }, orderBy: { at: "desc" } });
  if (!latest) return NextResponse.json({ currency: null, current: null, since: null, buckets: usageBuckets([], from, new Date(end), range.bucketMs) });
  const currency = latest.currency;
  const [before, inRange, first] = await Promise.all([
    prisma.balanceSnapshot.findFirst({ where: { apiKeyId: id, currency, at: { lt: from } }, orderBy: { at: "desc" } }),
    prisma.balanceSnapshot.findMany({ where: { apiKeyId: id, currency, at: { gte: from } }, orderBy: { at: "asc" } }),
    prisma.balanceSnapshot.findFirst({ where: { apiKeyId: id, currency }, orderBy: { at: "asc" }, select: { at: true } }),
  ]);
  const points = before ? [before, ...inRange] : inRange;
  return NextResponse.json({
    currency, current: latest.total, checkedAt: latest.at, since: first?.at ?? null, bucket: range.bucketMs === HOUR ? "hour" : "day",
    buckets: usageBuckets(points, from, new Date(end), range.bucketMs),
  }, { headers: { "Cache-Control": "no-store" } });
});
