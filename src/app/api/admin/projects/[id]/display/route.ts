import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";

type Context = { params: Promise<{ id: string }> };
const schema = z.object({ analyzedFilter: z.boolean().optional(), relevanceFilter: z.boolean().optional() });

// How the media pages look for this project. Admins only: adminRoute refuses writes from viewers and clients.
export const PUT = adminRoute(async (req: Request, { params }: Context, _username, user) => {
  if (user.role !== "admin") return NextResponse.json({ error: "Khusus admin" }, { status: 403 });
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pengaturan tidak valid" }, { status: 400 });
  const key = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!key) return NextResponse.json({ error: "Proyek tidak ditemukan" }, { status: 404 });
  const { analyzedFilter, relevanceFilter } = parsed.data;
  const row = await prisma.project.update({ where: { id }, data: { showAnalyzedFilter: analyzedFilter, showRelevanceFilter: relevanceFilter }, select: { showAnalyzedFilter: true, showRelevanceFilter: true } });
  return NextResponse.json({ analyzedFilter: row.showAnalyzedFilter, relevanceFilter: row.showRelevanceFilter });
});
