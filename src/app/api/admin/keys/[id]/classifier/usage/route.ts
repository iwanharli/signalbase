import { NextResponse } from "next/server";
import { usageBuckets } from "@/lib/server/ai/balance";
import { classifierKeyHint, keySince } from "@/lib/server/ai/platform";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { liveKurs } from "@/lib/server/kurs";

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

  // Saldo hanya sejak key penyedia saat ini dipakai; snapshot sebelumnya milik key lain (mis. key klien yang dulu dipakai bersama).
  const classifier = await prisma.classifier.findUnique({ where: { apiKeyId: id }, select: { providerKind: true, providerKeyHint: true } });
  const keyFrom = classifier ? await keySince(id, classifierKeyHint(classifier)) : null;
  const own = { apiKeyId: id, at: { gte: keyFrom ?? new Date(0) } };
  const [latest, kurs] = await Promise.all([keyFrom ? prisma.balanceSnapshot.findFirst({ where: own, orderBy: { at: "desc" } }) : null, liveKurs()]);
  if (!latest) return NextResponse.json({ currency: null, current: null, since: null, bucket: range.bucketMs === HOUR ? "hour" : "day", buckets: usageBuckets([], from, new Date(end), range.bucketMs), tokens, models, kurs });
  const currency = latest.currency;
  const [before, inRange, first] = await Promise.all([
    prisma.balanceSnapshot.findFirst({ where: { ...own, currency, AND: { at: { lt: from } } }, orderBy: { at: "desc" } }),
    prisma.balanceSnapshot.findMany({ where: { apiKeyId: id, currency, at: { gte: from > own.at.gte ? from : own.at.gte } }, orderBy: { at: "asc" } }),
    prisma.balanceSnapshot.findFirst({ where: { ...own, currency }, orderBy: { at: "asc" }, select: { at: true } }),
  ]);
  const points = before ? [before, ...inRange] : inRange;
  return NextResponse.json({
    currency, current: latest.total, checkedAt: latest.at, since: first?.at ?? null, bucket: range.bucketMs === HOUR ? "hour" : "day",
    buckets: usageBuckets(points, from, new Date(end), range.bucketMs), tokens, models, kurs,
  }, { headers: { "Cache-Control": "no-store" } });
});
