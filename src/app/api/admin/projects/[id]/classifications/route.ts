import { NextResponse } from "next/server";
import { z } from "zod";
import { categoriesForType, NO_CATEGORY } from "@/lib/ai/classifier";
import { fetchItemsByCode } from "@/lib/server/bank";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";

type Context = { params: Promise<{ id: string }> };
const correctionSchema = z.object({ type: z.enum(["social", "online"]), code: z.string().min(1).max(100), category: z.string().min(1).max(20) });

// Sets an item's category by hand (admins, and clients the project is given to). Marked manual, so the worker and restarts keep it.
export const PUT = adminRoute(async (req: Request, { params }: Context, user) => {
  const { id } = await params;
  const parsed = correctionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Data koreksi tidak valid" }, { status: 400 });
  const { type, code, category } = parsed.data;

  const classifier = await prisma.classifier.findUnique({ where: { projectId: id } });
  if (!classifier) return NextResponse.json({ error: "Proyek ini belum memakai kategorisasi AI" }, { status: 404 });
  const codes = (categoriesForType(classifier, type) as { code: string }[]).map((c) => c.code);
  if (category !== NO_CATEGORY && !codes.includes(category)) return NextResponse.json({ error: "Kategori tidak dikenal" }, { status: 400 });

  const existing = await prisma.classification.findUnique({ where: { projectId_type_code: { projectId: id, type, code } } });
  const publishedAt = existing?.publishedAt ?? (await fetchItemsByCode(type, [code]))[0]?.publishedAt;
  if (!publishedAt) return NextResponse.json({ error: "Item tidak ditemukan" }, { status: 404 });

  const aiReason = `Alasan AI: ${existing?.reason ?? "-"}`;
  const reason = existing && !existing.manual
    ? (existing.category === category ? `Dikonfirmasi manual. ${aiReason}` : `Dikoreksi dari ${existing.category}. ${aiReason}`)
    : existing?.reason ?? "Dikategorikan manual";
  const row = await prisma.classification.upsert({
    where: { projectId_type_code: { projectId: id, type, code } },
    create: { projectId: id, type, code, category, confidence: null, reason: "Dikategorikan manual", publishedAt: new Date(publishedAt), model: "manual", manual: true, correctedBy: user },
    update: { category, manual: true, correctedBy: user, reason, confidence: null },
  });
  return NextResponse.json({ category: row.category, manual: true, correctedBy: user, reason: row.reason });
});
