import { NextResponse } from "next/server";
import { revealKey } from "@/lib/server/apiKey";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";

type Context = { params: Promise<{ id: string }> };

// The full key value, for the panel's copy button. Never cached.
export const GET = adminRoute(async (_req: Request, { params }: Context) => {
  const { id } = await params;
  const row = await prisma.apiKey.findUnique({ where: { id }, select: { keyEnc: true, revokedAt: true } });
  if (!row) return NextResponse.json({ error: "Kunci tidak ditemukan" }, { status: 404 });
  if (row.revokedAt) return NextResponse.json({ error: "Kunci sudah dicabut" }, { status: 409 });
  const key = revealKey(row.keyEnc);
  if (!key) return NextResponse.json({ error: "Kunci lama tidak tersimpan. Buat ulang kunci agar bisa disalin." }, { status: 409 });
  return NextResponse.json({ key }, { headers: { "Cache-Control": "no-store" } });
});
