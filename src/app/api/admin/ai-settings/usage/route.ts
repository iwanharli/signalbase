import { NextResponse } from "next/server";
import type { UsageResponse } from "@/lib/ai/summary";
import { providerBalance } from "@/lib/server/ai/balance";
import { getSetting, jakartaDay, settingConfig } from "@/lib/server/ai/summary";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";

const PAGE = 25;
const DAYS = 30;

// Cost history of the platform AI: this month, cost per day (30 days), one page of calls (?page=), provider balance.
export const GET = adminRoute(async (req: Request) => {
  const page = Math.max(0, Number(new URL(req.url).searchParams.get("page")) || 0);
  const setting = await getSetting();
  const monthStart = new Date(`${jakartaDay().slice(0, 7)}-01T00:00:00+07:00`);
  const since = new Date(`${jakartaDay(new Date(Date.now() - (DAYS - 1) * 86_400_000))}T00:00:00+07:00`);
  const [month, rows, total, recent, balance] = await Promise.all([
    prisma.aiUsageLog.aggregate({ where: { at: { gte: monthStart } }, _sum: { cost: true, inputTokens: true, outputTokens: true }, _count: true }),
    prisma.aiUsageLog.findMany({ orderBy: { at: "desc" }, skip: page * PAGE, take: PAGE }),
    prisma.aiUsageLog.count(),
    prisma.aiUsageLog.findMany({ where: { at: { gte: since } }, select: { at: true, cost: true } }),
    setting?.providerKeyEnc ? providerBalance(settingConfig(setting)).catch(() => null) : Promise.resolve(null),
  ]);
  const byDay = new Map<string, { cost: number; calls: number }>();
  for (const r of recent) {
    const d = jakartaDay(r.at), e = byDay.get(d) ?? { cost: 0, calls: 0 };
    e.cost += r.cost; e.calls++;
    byDay.set(d, e);
  }
  const daily = Array.from({ length: DAYS }, (_, i) => {
    const day = jakartaDay(new Date(Date.now() - (DAYS - 1 - i) * 86_400_000));
    return { day, ...(byDay.get(day) ?? { cost: 0, calls: 0 }) };
  });
  const body: UsageResponse = {
    currency: setting?.currency ?? "USD",
    month: { cost: month._sum.cost ?? 0, calls: month._count, tokens: (month._sum.inputTokens ?? 0) + (month._sum.outputTokens ?? 0), budget: setting?.monthlyBudget ?? null },
    daily,
    rows: rows.map((r) => ({ ...r, at: r.at.toISOString() })),
    total,
    balance: balance?.supported ? balance.balances.map((b) => ({ currency: b.currency, total: b.total })) : null,
  };
  return NextResponse.json(body);
});
