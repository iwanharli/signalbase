import { NextResponse } from "next/server";
import { categoriesForType, NO_CATEGORY, type Category } from "@/lib/ai/classifier";
import { allowsType, parseKeyScope } from "@/lib/media/keyScope";
import { MEDIA_TYPES, type MediaType } from "@/lib/media/types";
import { CHECKED } from "@/lib/server/ai/labelProgress";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";

type Context = { params: Promise<{ id: string }> };
type Cursors = Partial<Record<MediaType, { backfillDone?: boolean }>>;

// Beranda: how far a project's AI categorisation and AI labelling have got and what they found, per media type. Only the
// features an admin has switched on; no provider, cost or error details (clients read this too, for their own projects).
export const GET = adminRoute(async (_req: Request, { params }: Context) => {
  const { id } = await params;
  const key = await prisma.apiKey.findUnique({
    where: { id },
    select: { scope: true, keywords: true, manualLabels: true, classifier: true, labelAi: { select: { enabled: true, cursors: true } } },
  });
  if (!key) return NextResponse.json({ error: "Proyek tidak ditemukan" }, { status: 404 });
  const scope = parseKeyScope(key.scope, key.keywords);
  const types = MEDIA_TYPES.filter((t) => allowsType(scope, t));
  const classifier = key.classifier?.enabled ? key.classifier : null;
  const labelling = key.labelAi?.enabled && key.manualLabels.length ? key.labelAi : null;

  const [cats, checked, empty, labels] = await Promise.all([
    classifier ? prisma.classification.groupBy({ by: ["type", "category"], where: { apiKeyId: id }, _count: true }) : [],
    labelling ? prisma.labelAiItem.groupBy({ by: ["type"], where: { apiKeyId: id, ...CHECKED }, _count: true }) : [],
    labelling ? prisma.labelAiItem.groupBy({ by: ["type"], where: { apiKeyId: id, status: "empty" }, _count: true }) : [],
    labelling ? prisma.itemLabel.groupBy({ by: ["type", "label"], where: { apiKeyId: id, source: "ai" }, _count: true }) : [],
  ]);
  const ofType = (rows: { type: string; _count: number }[], type: MediaType) => rows.find((r) => r.type === type)?._count ?? 0;

  return NextResponse.json({
    categorisation: classifier && {
      types: types.map((type) => {
        const rows = cats.filter((c) => c.type === type);
        const n = (code: string) => rows.find((r) => r.category === code)?._count ?? 0;
        return {
          type, done: !!(classifier.cursors as Cursors)?.[type]?.backfillDone, total: rows.reduce((t, r) => t + r._count, 0),
          rows: [...(categoriesForType(classifier, type) as Category[]).map((c) => ({ code: c.code, label: c.label, n: n(c.code) })),
            { code: NO_CATEGORY, label: "Tidak termasuk", n: n(NO_CATEGORY) }],
        };
      }),
    },
    labelling: labelling && {
      types: types.map((type) => ({
        type, done: !!(labelling.cursors as Cursors)?.[type]?.backfillDone, total: ofType(checked, type),
        rows: [...key.manualLabels.map((label) => ({ label, n: labels.find((l) => l.type === type && l.label === label)?._count ?? 0 })),
          { label: null, n: ofType(empty, type) }],
      })),
    },
  });
});
