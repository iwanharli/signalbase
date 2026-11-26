import { NextResponse } from "next/server";
import { z } from "zod";
import { jakartaToday } from "@/lib/plans";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { grantAccess } from "@/lib/server/projectAccess";

type Context = { params: Promise<{ id: string }> };

/** Every active project, whether this client was given it, and (if so) its key for the client and its API calls. */
async function load(id: string) {
  const account = await prisma.admin.findFirst({ where: { id, role: "user" }, select: { id: true } });
  if (!account) return null;
  const since = new Date(Date.now() - 29 * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  const [projects, usage] = await Promise.all([
    prisma.apiKey.findMany({
      where: { revokedAt: null },
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, keywords: true,
        members: { where: { accountId: id }, select: { keyPrefix: true, keyCreatedAt: true, keyLastUsedAt: true, keyRevokedAt: true, keyEnc: true, createdAt: true } },
        _count: { select: { members: true } },
      },
    }),
    prisma.projectAccessUsage.groupBy({ by: ["apiKeyId", "day"], where: { accountId: id, day: { gte: since } }, _sum: { count: true } }),
  ]);
  const today = jakartaToday();
  const calls = (keyId: string, onlyToday: boolean) => usage.filter((u) => u.apiKeyId === keyId && (!onlyToday || u.day === today)).reduce((n, u) => n + (u._sum.count ?? 0), 0);
  return projects.map((p) => {
    const m = p.members[0];
    return {
      id: p.id, name: p.name, keywords: p.keywords, clients: p._count.members,
      access: m ? {
        since: m.createdAt, keyPrefix: m.keyPrefix, keyCreatedAt: m.keyCreatedAt, keyLastUsedAt: m.keyLastUsedAt, keyRevokedAt: m.keyRevokedAt,
        copyable: !!m.keyEnc && !m.keyRevokedAt, callsToday: calls(p.id, true), calls30: calls(p.id, false),
      } : null,
    };
  });
}

// Admin only (ADMIN_ONLY covers /api/admin/users).
export const GET = adminRoute(async (_req: Request, { params }: Context) => {
  const projects = await load((await params).id);
  if (!projects) return NextResponse.json({ error: "Klien tidak ditemukan" }, { status: 404 });
  return NextResponse.json({ projects });
});

const bodySchema = z.object({ projectIds: z.array(z.string().uuid()).max(500) });

// Sets the client's projects to exactly projectIds: new ones are given (each with a new key for the client), the others
// taken away (their client keys stop at once). The projects themselves are not touched.
export const PUT = adminRoute(async (req: Request, { params }: Context, username) => {
  const { id } = await params;
  const projects = await load(id);
  if (!projects) return NextResponse.json({ error: "Klien tidak ditemukan" }, { status: 404 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Daftar proyek tidak valid" }, { status: 400 });
  const wanted = new Set(parsed.data.projectIds);
  for (const p of projects) if (wanted.has(p.id) && !p.access) await grantAccess(p.id, id, username);
  const remove = projects.filter((p) => p.access && !wanted.has(p.id)).map((p) => p.id);
  if (remove.length) await prisma.projectMember.deleteMany({ where: { accountId: id, apiKeyId: { in: remove } } });
  return NextResponse.json({ ok: true, projects: await load(id) });
});
