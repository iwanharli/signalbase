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

  // Tokens per bucket from what the worker recorded, for every provider.
  const tokenRows = await prisma.tokenUsage.findMany({ where: { apiKeyId: id, hour: { gte: from } } });
  const bucketCount = Math.max(1, Math.round((end - from.getTime()) / range.bucketMs));
  const tokens = Array.from({ length: bucketCount }, (_, i) => ({ start: new Date(from.getTime() + i * range.bucketMs).toISOString(), input: 0, output: 0, calls: 0 }));
  for (const t of tokenRows) {
    const i = Math.min(bucketCount - 1, Math.floor((t.hour.getTime() - from.getTime()) / range.bucketMs));
    if (i < 0) continue;
    tokens[i].input += t.inputTokens; tokens[i].output += t.outputTokens; tokens[i].calls += t.calls;
  }
  const models = [...new Set(tokenRows.map((t) => t.model))];

  const latest = await prisma.balanceSnapshot.findFirst({ where: { apiKeyId: id }, orderBy: { at: "desc" } });
  if (!latest) return NextResponse.json({ currency: null, current: null, since: null, bucket: range.bucketMs === HOUR ? "hour" : "day", buckets: usageBuckets([], from, new Date(end), range.bucketMs), tokens, models });
  const currency = latest.currency;
  const [before, inRange, first] = await Promise.all([
    prisma.balanceSnapshot.findFirst({ where: { apiKeyId: id, currency, at: { lt: from } }, orderBy: { at: "desc" } }),
    prisma.balanceSnapshot.findMany({ where: { apiKeyId: id, currency, at: { gte: from } }, orderBy: { at: "asc" } }),
    prisma.balanceSnapshot.findFirst({ where: { apiKeyId: id, currency }, orderBy: { at: "asc" }, select: { at: true } }),
  ]);
  const points = before ? [before, ...inRange] : inRange;
  return NextResponse.json({
    currency, current: latest.total, checkedAt: latest.at, since: first?.at ?? null, bucket: range.bucketMs === HOUR ? "hour" : "day",
    buckets: usageBuckets(points, from, new Date(end), range.bucketMs), tokens, models,
  }, { headers: { "Cache-Control": "no-store" } });
});
