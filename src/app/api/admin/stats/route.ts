import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";

// Reviewed counts per type and status, plus today's and the last 14 days of approvals.
export const GET = adminRoute(async () => {
  const today = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }) + "T00:00:00+07:00");
  const [groups, todayGroups, daily, moods, keys] = await Promise.all([
    prisma.item.groupBy({ by: ["type", "status"], _count: true }),
    prisma.item.groupBy({ by: ["status"], where: { reviewedAt: { gte: today } }, _count: true }),
    prisma.$queryRaw<{ day: string; n: number }[]>`
      select to_char(("reviewedAt" at time zone 'UTC') at time zone 'Asia/Jakarta', 'YYYY-MM-DD') as day, count(*)::int n
      from "Item" where status = 'approved' and "reviewedAt" > now() - interval '14 days' group by 1 order by 1`,
    prisma.item.groupBy({ by: ["type", "mood"], where: { status: "approved" }, _count: true }),
    prisma.apiKey.count({ where: { revokedAt: null } }),
  ]);
  const count = (type: string, status: string) => groups.find((g) => g.type === type && g.status === status)?._count ?? 0;
  return NextResponse.json({
    sosial: { approved: count("sosial", "approved"), rejected: count("sosial", "rejected") },
    online: { approved: count("online", "approved"), rejected: count("online", "rejected") },
    today: { approved: todayGroups.find((g) => g.status === "approved")?._count ?? 0, rejected: todayGroups.find((g) => g.status === "rejected")?._count ?? 0 },
    daily, keys,
    moods: moods.map((m) => ({ type: m.type, mood: m.mood, n: m._count })),
  });
});
