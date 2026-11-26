import { NextResponse } from "next/server";
import { adminRoute, keyAccess } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";

type Context = { params: Promise<{ id: string }> };

// Deletes an SNA watch: its creator, an admin, or the owner of its project.
export const DELETE = adminRoute(async (_req: Request, { params }: Context, _username, user) => {
  const { id } = await params;
  const watch = await prisma.snaWatch.findUnique({ where: { id }, select: { apiKeyId: true, createdBy: true } });
  const allowed = watch && (user.role === "admin" || watch.createdBy === user.id || (watch.apiKeyId && (await keyAccess(user, watch.apiKeyId)) === "full"));
  if (!watch || (!allowed && !(watch.apiKeyId && (await keyAccess(user, watch.apiKeyId))))) return NextResponse.json({ error: "Pantauan tidak ditemukan" }, { status: 404 });
  if (!allowed) return NextResponse.json({ error: "Tidak boleh menghapus pantauan ini" }, { status: 403 });
  await prisma.snaWatch.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
