import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";

type Context = { params: Promise<{ id: string }> };

// "Hanya sudah dikategorisasi": the API serves only items this project's AI has labelled. A display rule, so the
// stored labels and the categorisation progress are untouched. adminRoute already checks a user owns the key.
export const PUT = adminRoute(async (req: Request, { params }: Context) => {
  const { id } = await params;
  const parsed = z.object({ value: z.boolean() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Nilai tidak valid" }, { status: 400 });
  const classifier = await prisma.classifier.findUnique({ where: { apiKeyId: id }, select: { apiKeyId: true } });
  if (!classifier) return NextResponse.json({ error: "Aktifkan kategorisasi AI dulu untuk proyek ini" }, { status: 409 });
  await prisma.classifier.update({ where: { apiKeyId: id }, data: { labelledOnly: parsed.data.value } });
  return NextResponse.json({ labelledOnly: parsed.data.value });
});
