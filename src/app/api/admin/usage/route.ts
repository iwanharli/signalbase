import { NextResponse } from "next/server";
import { jakartaToday, limitsFor, PLAN_LABEL, isPlanId } from "@/lib/plans";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { aiQuota, platformPostsThisMonth } from "@/lib/server/ai/platform";

// Today's public API calls: per key, and for a user account the total against its plan's daily limit.
export const GET = adminRoute(async (_req: Request, _ctx, _username, user) => {
  const day = jakartaToday();
  const rows = await prisma.apiKeyUsage.findMany({
    where: { day, ...(user.role === "user" ? { apiKey: { ownerId: user.id } } : {}) },
    select: { apiKeyId: true, count: true },
  });
  const perKey = Object.fromEntries(rows.map((r) => [r.apiKeyId, r.count]));
  if (user.role !== "user") return NextResponse.json({ day, perKey, used: null, limit: null, plan: null });
  const account = await prisma.admin.findUnique({ where: { id: user.id }, select: { plan: true } });
  const limits = limitsFor(account?.plan);
  return NextResponse.json({
    day, perKey,
    used: rows.reduce((t, r) => t + r.count, 0),
    limit: limits.callsPerDay,
    plan: isPlanId(account?.plan) ? PLAN_LABEL[account.plan] : null,
    ai: { used: await platformPostsThisMonth(user.id), limit: await aiQuota(user.id, limits.aiPostsPerMonth) },
  });
});
