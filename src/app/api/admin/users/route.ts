import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { endOfDay, newAccountSchema } from "@/lib/accounts";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";

// Admin only (see ADMIN_ONLY in auth.ts): every account, admins first (read-only on this page; `self` marks the caller),
// then sign-ups waiting for approval, active and suspended accounts; with how many projects each client was given.
export const GET = adminRoute(async (_req: Request, _ctx, _username, user) => {
  const accounts = await prisma.admin.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, username: true, role: true, status: true, planExpiresAt: true, institution: true, requestedTopics: true, createdAt: true,
      _count: { select: { sharedProjects: { where: { apiKey: { revokedAt: null } } } } },
    },
  });
  const rank: Record<string, number> = { pending: 0, active: 1, suspended: 2 };
  const order = (r: (typeof accounts)[number]) => (r.role === "admin" ? -1 : rank[r.status] ?? 3);
  return NextResponse.json(accounts.sort((a, b) => order(a) - order(b)).map(({ _count, ...a }) => ({ ...a, self: a.id === user.id, projects: _count.sharedProjects })));
});

// Admin only: create an account directly (no sign-up, already active). Clients get the Instansi plan.
export const POST = adminRoute(async (req: Request) => {
  const parsed = newAccountSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Data tidak valid" }, { status: 400 });
  const { name, username, password, role, institution, expiresAt } = parsed.data;
  if (await prisma.admin.findUnique({ where: { username }, select: { id: true } })) {
    return NextResponse.json({ error: "Username sudah dipakai" }, { status: 409 });
  }
  const account = await prisma.admin.create({
    data: {
      name, username, role, institution, status: "active",
      ...(role === "user" ? { plan: "instansi", planExpiresAt: expiresAt ? endOfDay(expiresAt) : null } : {}),
      passwordHash: await bcrypt.hash(password, 10),
    },
    select: { id: true },
  });
  return NextResponse.json({ ok: true, id: account.id });
});
