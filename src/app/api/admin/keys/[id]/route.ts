import { NextResponse } from "next/server";
import { z } from "zod";
import { providerLabel } from "@/lib/ai/classifier";
import { keyScopeSchema, parseKeyScope, type KeyScope } from "@/lib/media/keyScope";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";

type Context = { params: Promise<{ id: string }> };

const updateKeySchema = z.object({
  name: z.string().trim().min(2).max(80),
  scope: keyScopeSchema,
});

const sameScope = (a: KeyScope, b: KeyScope) => JSON.stringify(a) === JSON.stringify(b);

// One key with its scope and AI categorisation summary.
export const GET = adminRoute(async (_req: Request, { params }: Context) => {
  const { id } = await params;
  const key = await prisma.apiKey.findUnique({
    where: { id },
    include: { classifier: true, _count: { select: { classifications: true } } },
  });
  if (!key) return NextResponse.json({ error: "Kunci tidak ditemukan" }, { status: 404 });
  return NextResponse.json({
    id: key.id, name: key.name, prefix: key.prefix, createdBy: key.createdBy, createdAt: key.createdAt, lastUsedAt: key.lastUsedAt, revokedAt: key.revokedAt,
    keywords: key.keywords, scope: parseKeyScope(key.scope, key.keywords),
    copyable: !!key.keyEnc,
    classifier: key.classifier && {
      enabled: key.classifier.enabled, providerName: providerLabel(key.classifier.providerKind, key.classifier.providerBaseUrl), model: key.classifier.providerModel,
      processed: key._count.classifications, lastError: key.classifier.lastError, lastRunAt: key.classifier.lastRunAt,
    },
  });
});

// Rename a key or change its scope. A scope change restarts the key's AI categorisation,
// because the stored labels were made for the old set of items.
export const PATCH = adminRoute(async (req: Request, { params }: Context) => {
  const { id } = await params;
  const parsed = updateKeySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.path[0] === "name" ? "Nama minimal 2 karakter" : "Parameter cakupan tidak valid";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  const key = await prisma.apiKey.findUnique({ where: { id }, include: { classifier: { select: { apiKeyId: true } } } });
  if (!key) return NextResponse.json({ error: "Kunci tidak ditemukan" }, { status: 404 });
  if (key.revokedAt) return NextResponse.json({ error: "Kunci yang sudah dicabut tidak bisa diubah" }, { status: 409 });

  const scope: KeyScope = {
    ...parsed.data.scope,
    keywords: [...new Set(parsed.data.scope.keywords)],
    provinces: [...new Set(parsed.data.scope.provinces)],
    categories: [...new Set(parsed.data.scope.categories)],
  };
  const scopeChanged = !sameScope(scope, parseKeyScope(key.scope, key.keywords));
  const { keywords, ...rest } = scope;
  const restartAi = scopeChanged && !!key.classifier;

  await prisma.$transaction([
    prisma.apiKey.update({ where: { id }, data: { name: parsed.data.name, keywords, scope: rest } }),
    ...(restartAi
      ? [
        prisma.classification.deleteMany({ where: { apiKeyId: id } }),
        prisma.classifier.update({ where: { apiKeyId: id }, data: { cursors: {}, processed: 0, failed: 0, lastError: null } }),
      ]
      : []),
  ]);
  return NextResponse.json({ ok: true, scopeChanged, aiRestarted: restartAi });
});

// Revoking keeps the row so the list shows when and which key was cut off.
export const DELETE = adminRoute(async (_req: Request, { params }: Context) => {
  const { id } = await params;
  await prisma.apiKey.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
  return NextResponse.json({ ok: true });
});
