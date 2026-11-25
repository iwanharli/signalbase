// Manual labels of a project, as the panel and the public API read them. Separate from AI categorisation.
import { Prisma } from "@prisma/client";
import { ANY_CATEGORY, LOW_CONFIDENCE, LOW_CONFIDENCE_FILTER } from "@/lib/ai/classifier";
import { AI_LABELS, AI_NO_LABEL, AI_REVIEW, ANY_LABEL, sortLabels, type ItemLabelEntry } from "@/lib/media/manualLabels";
import type { KeyScope } from "@/lib/media/keyScope";
import type { MediaType } from "@/lib/media/types";
import { filterCodes } from "./bank";
import { prisma } from "./db";

/** Most labelled items considered for one filtered page (manual labels stay far below this). */
const LABEL_CAP = 50_000;

/** The project's label choices, or null when it has none (then items carry no `manualLabel`). */
export async function projectLabels(apiKeyId: string): Promise<string[] | null> {
  const key = await prisma.apiKey.findUnique({ where: { id: apiKeyId }, select: { manualLabels: true } });
  return key?.manualLabels.length ? key.manualLabels : null;
}

/** Labels per item code for the given items, in the project's order; unlabelled items are absent. */
export async function itemLabelsFor(apiKeyId: string, type: MediaType, codes: string[], options: string[]) {
  const byCode = new Map<string, ItemLabelEntry[]>();
  if (!codes.length) return byCode;
  const rows = await prisma.itemLabel.findMany({ where: { apiKeyId, type, code: { in: codes } }, select: { code: true, label: true, source: true, score: true, additionalData: true } });
  for (const r of rows) {
    const data = r.additionalData as Pick<ItemLabelEntry, "reason" | "needsReview" | "sources"> | null;
    byCode.set(r.code, [...(byCode.get(r.code) ?? []), {
      label: r.label, source: r.source === "ai" ? "ai" : "human", score: r.score,
      reason: data?.reason ?? null, needsReview: data?.needsReview, sources: data?.sources?.filter((x) => /^https?:\/\//i.test(x.url)) ?? [],
    }]);
  }
  for (const [code, entries] of byCode) byCode.set(code, sortLabels(entries, options));
  return byCode;
}

/** SQL for the AI labels a person should look at; labels stored before `needsReview` existed go by their score. */
export const NEEDS_REVIEW = Prisma.sql`source = 'ai' AND coalesce((additional_data->>'needsReview')::boolean, score < 60)`;

/** Items behind one value of the label filter, newest first, one entry per item however many labels it has. */
async function labelledCodes(apiKeyId: string, type: MediaType, label: string): Promise<{ code: string }[]> {
  if (label === AI_NO_LABEL) return prisma.labelAiItem.findMany({ where: { apiKeyId, type, status: "empty" }, orderBy: { updatedAt: "desc" }, take: LABEL_CAP, select: { code: true } });
  if (label === AI_REVIEW) return prisma.$queryRaw`
    SELECT code FROM "ItemLabel" WHERE "apiKeyId" = ${apiKeyId} AND type = ${type} AND ${NEEDS_REVIEW}
    GROUP BY code ORDER BY max("updatedAt") DESC LIMIT ${LABEL_CAP}`;
  const where = label === ANY_LABEL ? {} : label === AI_LABELS ? { source: "ai" } : { label };
  const rows = await prisma.itemLabel.groupBy({ by: ["code"], where: { apiKeyId, type, ...where }, orderBy: { _max: { updatedAt: "desc" } }, take: LABEL_CAP });
  return rows;
}

/**
 * Items with one manual label (or any, with ANY_LABEL) that also match the other request filters and the scope, in
 * timeline order: the labels give the candidates, the source database filters and sorts them. With `aiCategory` the
 * candidates are also limited to items in that AI category (both filters together).
 */
export async function labelPage(apiKeyId: string, type: MediaType, label: string, query: URLSearchParams, scope: KeyScope, { limit, offset }: { limit: number; offset: number }, aiCategory: string | null = null) {
  const rows = await labelledCodes(apiKeyId, type, label);
  let codes = rows.map((r) => r.code);
  if (aiCategory && codes.length) {
    const category = aiCategory === ANY_CATEGORY ? {} : aiCategory === LOW_CONFIDENCE_FILTER ? { manual: false, confidence: { lt: LOW_CONFIDENCE } } : { category: aiCategory };
    const inCategory = await prisma.classification.findMany({ where: { apiKeyId, type, code: { in: codes }, ...category }, select: { code: true } });
    const keep = new Set(inCategory.map((r) => r.code));
    codes = codes.filter((c) => keep.has(c));
  }
  const matching = await filterCodes(type, query, scope, codes);
  return { total: matching.length, codes: matching.slice(offset, offset + limit), all: matching };
}
