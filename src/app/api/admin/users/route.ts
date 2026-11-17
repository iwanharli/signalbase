import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { newAccountSchema } from "@/lib/accounts";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";

// Admin only (see ADMIN_ONLY in auth.ts): every account. Admins first (read-only on this page; `self` marks the caller),
// then clients by status with each sub-account right after its main account, with how many projects each has (owned, or
// shared with a sub-account).
export const GET = adminRoute(async (_req: Request, _ctx, _username, user) => {
  const accounts = await prisma.admin.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, username: true, role: true, status: true, plan: true, planExpiresAt: true, requestedPlan: true, createdAt: true, parentId: true, demo: true,
      _count: { select: { sharedProjects: { where: { apiKey: { revokedAt: null } } } } },
    },
  });
  const owned = await prisma.apiKey.groupBy({ by: ["ownerId"], where: { ownerId: { in: accounts.map((u) => u.id) }, revokedAt: null }, _count: true });
  const ownedBy = new Map(owned.map((k) => [k.ownerId, k._count]));
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const rank = { pending: 0, active: 1, suspended: 2 } as Record<string, number>;
  const rows = accounts.map(({ _count, ...a }) => {
    const parent = a.parentId ? byId.get(a.parentId) : undefined;
    return {
      ...a, self: a.id === user.id,
      keys: a.parentId ? _count.sharedProjects : ownedBy.get(a.id) ?? 0,
      parent: parent ? { id: parent.id, name: parent.name, plan: parent.plan, planExpiresAt: parent.planExpiresAt, status: parent.status, demo: parent.demo } : null,
    };
  });
  // Main accounts by status, then each one's sub-accounts directly below it.
  const order = (r: (typeof rows)[number]) => (r.role === "admin" ? -1 : rank[r.status] ?? 3);
  const mains = rows.filter((r) => !r.parentId).sort((a, b) => order(a) - order(b));
  return NextResponse.json(mains.flatMap((m) => [m, ...rows.filter((r) => r.parentId === m.id)]));
});

// Admin only: create an account directly (no sign-up, already active). See newAccountSchema for what each kind gets.
export const POST = adminRoute(async (req: Request) => {
  const parsed = newAccountSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Data tidak valid" }, { status: 400 });
  const { name, username, password, role, parentId, plan, expiresAt, demo } = parsed.data;
  if (await prisma.admin.findUnique({ where: { username }, select: { id: true } })) {
    return NextResponse.json({ error: "Username sudah dipakai" }, { status: 409 });
  }
  if (parentId) {
    const parent = await prisma.admin.findFirst({ where: { id: parentId, role: "user", parentId: null }, select: { status: true } });
    if (!parent) return NextResponse.json({ error: "Akun utama klien tidak ditemukan" }, { status: 404 });
    if (parent.status === "pending") return NextResponse.json({ error: "Setujui dulu akun utama klien ini" }, { status: 409 });
  }
  const account = await prisma.admin.create({
    data: {
      name, username, role, parentId, plan, demo, status: "active",
      planExpiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59+07:00`) : null,
      passwordHash: await bcrypt.hash(password, 10),
    },
    select: { id: true },
  });
  return NextResponse.json({ ok: true, id: account.id });
});
