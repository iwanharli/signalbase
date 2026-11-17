import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";

type Context = { params: Promise<{ id: string }> };

/**
 * Projects an admin can give this account, and which it has now.
 * Main account: the projects it owns plus the admin's own projects (those of other clients are left out).
 * Sub-account: its parent's projects; the ones shared with it are selected.
 */
async function load(id: string) {
  const account = await prisma.admin.findFirst({ where: { id, role: "user" }, select: { id: true, parentId: true } });
  if (!account) return null;
  const projects = await prisma.apiKey.findMany({
    where: { revokedAt: null, ...(account.parentId ? { ownerId: account.parentId } : { OR: [{ ownerId: id }, { ownerId: null }] }) },
    orderBy: { name: "asc" },
    select: { id: true, name: true, keywords: true, ownerId: true, members: { where: { accountId: id }, select: { accountId: true } } },
  });
  return {
    account,
    options: projects.map((p) => ({ id: p.id, name: p.name, keywords: p.keywords, selected: account.parentId ? p.members.length > 0 : p.ownerId === id })),
  };
}

// Admin only (ADMIN_ONLY covers /api/admin/users).
export const GET = adminRoute(async (_req: Request, { params }: Context) => {
  const data = await load((await params).id);
  if (!data) return NextResponse.json({ error: "Pengguna tidak ditemukan" }, { status: 404 });
  return NextResponse.json({ kind: data.account.parentId ? "sub" : "main", projects: data.options });
});

const bodySchema = z.object({ projectIds: z.array(z.string().uuid()).max(500) });

// Sets the account's projects to exactly projectIds (only ids from the GET list count).
// Main account: chosen projects become its own, unchosen ones it owned go back to the admin (and its sub-accounts lose them).
// Sub-account: it sees exactly the chosen projects of its parent.
export const PUT = adminRoute(async (req: Request, { params }: Context) => {
  const data = await load((await params).id);
  if (!data) return NextResponse.json({ error: "Pengguna tidak ditemukan" }, { status: 404 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Daftar proyek tidak valid" }, { status: 400 });
  const wanted = new Set(parsed.data.projectIds);
  const add = data.options.filter((p) => wanted.has(p.id) && !p.selected).map((p) => p.id);
  const remove = data.options.filter((p) => !wanted.has(p.id) && p.selected).map((p) => p.id);
  const { id, parentId } = data.account;

  if (parentId) {
    await prisma.$transaction([
      prisma.projectMember.deleteMany({ where: { accountId: id, apiKeyId: { in: remove } } }),
      prisma.projectMember.createMany({ data: add.map((apiKeyId) => ({ apiKeyId, accountId: id })), skipDuplicates: true }),
    ]);
  } else {
    await prisma.$transaction([
      prisma.apiKey.updateMany({ where: { id: { in: add }, ownerId: null }, data: { ownerId: id } }),
      prisma.apiKey.updateMany({ where: { id: { in: remove }, ownerId: id }, data: { ownerId: null } }),
      prisma.projectMember.deleteMany({ where: { apiKeyId: { in: remove } } }),
    ]);
  }
  return NextResponse.json({ ok: true, added: add.length, removed: remove.length });
});
