import { NextResponse } from "next/server";
import { rotateKey } from "@/lib/server/apiKey";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";

type Context = { params: Promise<{ id: string }> };

// Issues a new value for the key. The old value stops working immediately.
export const POST = adminRoute(async (_req: Request, { params }: Context) => {
  const { id } = await params;
  const row = await prisma.apiKey.findUnique({ where: { id }, select: { revokedAt: true } });
  if (!row) return NextResponse.json({ error: "Proyek tidak ditemukan" }, { status: 404 });
  if (row.revokedAt) return NextResponse.json({ error: "Proyek yang sudah dicabut tidak bisa dibuat ulang" }, { status: 409 });
  const { key, prefix } = await rotateKey(id);
  return NextResponse.json({ key, prefix }, { headers: { "Cache-Control": "no-store" } });
});
