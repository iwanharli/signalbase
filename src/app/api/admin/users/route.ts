import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";

// Admin only (see ADMIN_ONLY in auth.ts): every user account, waiting approvals first, with their key count.
export const GET = adminRoute(async () => {
  const users = await prisma.admin.findMany({
    where: { role: "user" },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, username: true, status: true, createdAt: true },
  });
  const keyCounts = await prisma.apiKey.groupBy({ by: ["ownerId"], where: { ownerId: { in: users.map((u) => u.id) }, revokedAt: null }, _count: true });
  const keysOf = new Map(keyCounts.map((k) => [k.ownerId, k._count]));
  const rank = { pending: 0, active: 1, suspended: 2 } as Record<string, number>;
  return NextResponse.json(
    users.map((u) => ({ ...u, keys: keysOf.get(u.id) ?? 0 })).sort((a, b) => (rank[a.status] ?? 3) - (rank[b.status] ?? 3)),
  );
});
