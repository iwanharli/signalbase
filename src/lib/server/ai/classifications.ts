// Reading stored AI categories for the public API.
import { ANY_CATEGORY, categoriesForType, categorySchema, NO_CATEGORY, type Category } from "@/lib/ai/classifier";
import type { ItemClassification, MediaType } from "@/lib/media/types";
import { prisma } from "../db";

/** The key's category list, or null when the key has no (enabled) categorisation. */
/** The category filter a request gets: the one asked for, else "any" when the key serves labelled items only. */
export async function effectiveCategoryFilter(apiKeyId: string, requested: string | null) {
  if (requested) return requested;
  const c = await prisma.classifier.findUnique({ where: { apiKeyId }, select: { labelledOnly: true } });
  return c?.labelledOnly ? ANY_CATEGORY : null;
}

export async function keyCategories(apiKeyId: string, type: MediaType): Promise<Category[] | null> {
  const classifier = await prisma.classifier.findUnique({ where: { apiKeyId }, select: { enabled: true, categories: true, onlineCategories: true } });
  if (!classifier?.enabled) return null;
  const parsed = categorySchema.array().safeParse(categoriesForType(classifier, type));
  return parsed.success ? parsed.data : null;
}

const labelOf = (categories: Category[], code: string) =>
  code === NO_CATEGORY ? "Tidak termasuk" : categories.find((c) => c.code === code)?.label ?? code;

/** Stored categories for the given items, keyed by item code. Items not labelled yet are absent. */
export async function classificationsFor(apiKeyId: string, type: MediaType, codes: string[], categories: Category[], includeMetadata = false) {
  if (!codes.length) return new Map<string, ItemClassification>();
  const rows = await prisma.classification.findMany({ where: { apiKeyId, type, code: { in: codes } } });
  return new Map(rows.map((r) => [r.code, { category: r.category, label: labelOf(categories, r.category), confidence: r.confidence, reason: r.reason, ...(includeMetadata ? { model: r.model, categorizedAt: r.createdAt.toISOString() } : {}) }]));
}

const isDate = (value: string | null): value is string => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** Codes of items in one category, newest first, optionally within a date range (WIB days). */
export async function codesInCategory(apiKeyId: string, type: MediaType, category: string, query: URLSearchParams, { limit, offset }: { limit: number; offset: number }) {
  const from = query.get("from"), to = query.get("to");
  const publishedAt = {
    ...(isDate(from) ? { gte: new Date(`${from}T00:00:00+07:00`) } : {}),
    ...(isDate(to) ? { lt: new Date(new Date(`${to}T00:00:00+07:00`).getTime() + 86_400_000) } : {}),
  };
  const where = { apiKeyId, type, ...(category === ANY_CATEGORY ? {} : { category }), ...(Object.keys(publishedAt).length ? { publishedAt } : {}) };
  const [total, rows] = await Promise.all([
    prisma.classification.count({ where }),
    prisma.classification.findMany({
      where, orderBy: [{ publishedAt: query.get("sort") === "oldest" ? "asc" : "desc" }, { code: "asc" }], skip: offset, take: limit, select: { code: true },
    }),
  ]);
  return { total, codes: rows.map((r) => r.code) };
}

/** Items per category (including "none") for the summary view. */
export async function categoryBreakdown(apiKeyId: string, type: MediaType, categories: Category[]) {
  const groups = await prisma.classification.groupBy({ by: ["category"], where: { apiKeyId, type }, _count: true });
  const count = new Map(groups.map((g) => [g.category, g._count]));
  return [...categories.map((c) => c.code), NO_CATEGORY].map((code) => ({ code, label: labelOf(categories, code), n: count.get(code) ?? 0 }));
}
