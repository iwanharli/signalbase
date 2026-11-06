import { NextResponse } from "next/server";
import { classifierInputSchema } from "@/lib/ai/classifier";
import { parseKeyScope } from "@/lib/media/keyScope";
import { publicClassifier, saveClassifier, validationError } from "@/lib/server/ai/admin";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";

type Context = { params: Promise<{ id: string }> };

// A key's AI categorisation: settings, progress, and how many items fell into each category.
export const GET = adminRoute(async (_req: Request, { params }: Context) => {
  const { id } = await params;
  const key = await prisma.apiKey.findUnique({ where: { id }, include: { classifier: { include: { provider: true } } } });
  if (!key) return NextResponse.json({ error: "Kunci tidak ditemukan" }, { status: 404 });
  const counts = key.classifier
    ? await prisma.classification.groupBy({ by: ["type", "category"], where: { apiKeyId: id }, _count: true })
    : [];
  return NextResponse.json({
    key: { id: key.id, name: key.name, prefix: key.prefix, revokedAt: key.revokedAt, scope: parseKeyScope(key.scope, key.keywords) },
    classifier: key.classifier ? publicClassifier(key.classifier) : null,
    counts: counts.map((c) => ({ type: c.type, category: c.category, n: c._count })),
  });
});

export const PUT = adminRoute(async (req: Request, { params }: Context) => {
  const { id } = await params;
  const parsed = classifierInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error, "Pengaturan kategorisasi tidak valid");
  const [key, provider] = await Promise.all([
    prisma.apiKey.findUnique({ where: { id } }),
    prisma.aiProvider.findUnique({ where: { id: parsed.data.providerId } }),
  ]);
  if (!key || key.revokedAt) return NextResponse.json({ error: "Kunci tidak ditemukan atau sudah dicabut" }, { status: 404 });
  if (!provider) return NextResponse.json({ error: "Penyedia AI tidak ditemukan" }, { status: 400 });
  const classifier = await saveClassifier(id, parsed.data);
  return NextResponse.json(publicClassifier(classifier));
});

// Turns categorisation off and deletes its results.
export const DELETE = adminRoute(async (_req: Request, { params }: Context) => {
  const { id } = await params;
  await prisma.$transaction([
    prisma.classification.deleteMany({ where: { apiKeyId: id } }),
    prisma.classifier.deleteMany({ where: { apiKeyId: id } }),
  ]);
  return NextResponse.json({ ok: true });
});
