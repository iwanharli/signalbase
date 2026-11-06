import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";

// Revoking keeps the row so the list shows when and which key was cut off.
export const DELETE = adminRoute(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await prisma.apiKey.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
  return NextResponse.json({ ok: true });
});
