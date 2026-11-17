import { NextResponse } from "next/server";
import { jakartaToday, limitsFor, PLAN_LABEL, isPlanId } from "@/lib/plans";
import { adminRoute, visibleKeys } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { aiQuota, platformPostsThisMonth } from "@/lib/server/ai/platform";

// Today's public API calls: per key, and for a user account the client's total against its plan's daily limit (a sub-account
// shows its parent's totals: the plan, quotas and projects belong to the main account).
export const GET = adminRoute(async (_req: Request, _ctx, _username, user) => {
  const day = jakartaToday();
  const rows = await prisma.apiKeyUsage.findMany({
    where: { day, ...(user.role === "user" ? { apiKey: visibleKeys(user.id) } : {}) },
    select: { apiKeyId: true, count: true },
  });
  const perKey = Object.fromEntries(rows.map((r) => [r.apiKeyId, r.count]));
  if (user.role !== "user") return NextResponse.json({ day, perKey, used: null, limit: null, plan: null });
  const self = await prisma.admin.findUnique({ where: { id: user.id }, select: { plan: true, parentId: true, parent: { select: { plan: true } } } });
  const clientId = self?.parentId ?? user.id;
  const plan = self?.parent ? self.parent.plan : self?.plan;
  const limits = limitsFor(plan);
  const used = (await prisma.apiKeyUsage.aggregate({ _sum: { count: true }, where: { day, apiKey: { ownerId: clientId } } }))._sum.count ?? 0;
  return NextResponse.json({
    day, perKey, used,
    limit: limits.callsPerDay,
    plan: isPlanId(plan) ? PLAN_LABEL[plan] : null,
    ai: { used: await platformPostsThisMonth(clientId), limit: await aiQuota(clientId, limits.aiPostsPerMonth) },
    keys: await prisma.apiKey.count({ where: { ownerId: clientId, revokedAt: null } }),
  });
});
