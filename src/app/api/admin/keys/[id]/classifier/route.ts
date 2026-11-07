import { NextResponse } from "next/server";
import { classifierInputSchema, LOW_CONFIDENCE } from "@/lib/ai/classifier";
import { parseKeyScope } from "@/lib/media/keyScope";
import { MissingProviderKeyError, publicClassifier, saveClassifier, validationError } from "@/lib/server/ai/admin";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";

type Context = { params: Promise<{ id: string }> };

// A key's AI categorisation: settings (including its own AI provider), progress, and per-category counts.
export const GET = adminRoute(async (_req: Request, { params }: Context) => {
  const { id } = await params;
  const key = await prisma.apiKey.findUnique({ where: { id }, include: { classifier: true } });
  if (!key) return NextResponse.json({ error: "Kunci tidak ditemukan" }, { status: 404 });
  const counts = key.classifier
    ? await prisma.classification.groupBy({ by: ["type", "category"], where: { apiKeyId: id }, _count: true })
    : [];
  // Labels the model was unsure about and nobody has checked yet: the review queue.
  const lowConfidence = key.classifier
    ? await prisma.classification.count({ where: { apiKeyId: id, manual: false, confidence: { lt: LOW_CONFIDENCE } } })
    : 0;
  return NextResponse.json({
    key: { id: key.id, name: key.name, prefix: key.prefix, revokedAt: key.revokedAt, scope: parseKeyScope(key.scope, key.keywords) },
    classifier: key.classifier ? publicClassifier(key.classifier) : null,
    counts: counts.map((c) => ({ type: c.type, category: c.category, n: c._count })),
    lowConfidence,
  });
});

export const PUT = adminRoute(async (req: Request, { params }: Context) => {
  const { id } = await params;
  const parsed = classifierInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error, "Pengaturan kategorisasi tidak valid");
  const key = await prisma.apiKey.findUnique({ where: { id } });
  if (!key || key.revokedAt) return NextResponse.json({ error: "Kunci tidak ditemukan atau sudah dicabut" }, { status: 404 });
  try {
    return NextResponse.json(publicClassifier(await saveClassifier(id, parsed.data)));
  } catch (error) {
    if (error instanceof MissingProviderKeyError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
});

// Turns categorisation off and deletes its results and the stored provider key.
export const DELETE = adminRoute(async (_req: Request, { params }: Context) => {
  const { id } = await params;
  await prisma.$transaction([
    prisma.classification.deleteMany({ where: { apiKeyId: id } }),
    prisma.classifier.deleteMany({ where: { apiKeyId: id } }),
  ]);
  return NextResponse.json({ ok: true });
});
