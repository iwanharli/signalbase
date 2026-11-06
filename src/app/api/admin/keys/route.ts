import { NextResponse } from "next/server";
import { z } from "zod";
import { createKey } from "@/lib/server/apiKey";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";

export const GET = adminRoute(async () => {
  const keys = await prisma.apiKey.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, name: true, prefix: true, keywords: true, createdAt: true, lastUsedAt: true, revokedAt: true } });
  return NextResponse.json(keys);
});

export const POST = adminRoute(async (req: Request) => {
  const parsed = z.object({
    name: z.string().trim().min(2).max(80),
    keywords: z.array(z.string().trim().toLowerCase().min(2).max(60)).max(30).default([]),
  }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Nama minimal 2 karakter" }, { status: 400 });
  const { id, name, prefix, keywords, key } = await createKey(parsed.data.name, [...new Set(parsed.data.keywords)]);
  return NextResponse.json({ id, name, prefix, keywords, key });
});
