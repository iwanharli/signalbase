import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";

type Context = { params: Promise<{ id: string }> };

// Turns author details (name, username, profile, post link) in the public API on or off for one key.
export const PUT = adminRoute(async (req: Request, { params }: Context) => {
  const { id } = await params;
  const parsed = z.object({ enabled: z.boolean() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Parameter tidak valid" }, { status: 400 });
  const { count } = await prisma.apiKey.updateMany({ where: { id, revokedAt: null }, data: { showAuthors: parsed.data.enabled } });
  if (!count) return NextResponse.json({ error: "Kunci tidak ditemukan atau sudah dicabut" }, { status: 404 });
  return NextResponse.json({ ok: true });
});
