// Reading stored AI categories for the public API.
import { ANY_CATEGORY, LOW_CONFIDENCE, LOW_CONFIDENCE_FILTER, categoriesForType, categorySchema, NO_CATEGORY, type Category } from "@/lib/ai/classifier";
import type { ItemClassification, MediaType } from "@/lib/media/types";
import { hasExtraRestrictions, type KeyScope } from "@/lib/media/keyScope";
import { filterCodes } from "../bank";
import { sharedCache } from "../bank/cache";
import { filterKey } from "../bank/query";
import { prisma } from "../db";

/** The key's category list, or null when the key has no categorisation. Paused keys keep serving stored labels. */
/** The category filter a request gets: the one asked for, else "any" when the key serves labelled items only. */
export async function effectiveCategoryFilter(apiKeyId: string, requested: string | null) {
  if (requested) return requested;
  const c = await prisma.classifier.findUnique({ where: { apiKeyId }, select: { labelledOnly: true } });
  return c?.labelledOnly ? ANY_CATEGORY : null;
}

export async function keyCategories(apiKeyId: string, type: MediaType): Promise<Category[] | null> {
  const classifier = await prisma.classifier.findUnique({ where: { apiKeyId }, select: { categories: true, onlineCategories: true } });
  if (!classifier) return null;
  const parsed = categorySchema.array().safeParse(categoriesForType(classifier, type));
  return parsed.success ? parsed.data : null;
}

const labelOf = (categories: Category[], code: string) =>
  code === NO_CATEGORY ? "Tidak termasuk" : categories.find((c) => c.code === code)?.label ?? code;

/** Stored categories for the given items, keyed by item code. Items not labelled yet are absent. */
export async function classificationsFor(apiKeyId: string, type: MediaType, codes: string[], categories: Category[], includeMetadata = false) {
  if (!codes.length) return new Map<string, ItemClassification>();
  const rows = await prisma.classification.findMany({ where: { apiKeyId, type, code: { in: codes } } });
  return new Map(rows.map((r) => [r.code, { category: r.category, label: labelOf(categories, r.category), confidence: r.confidence, reason: r.reason, manual: r.manual, correctedBy: r.correctedBy, ...(includeMetadata ? { categorizedAt: r.createdAt.toISOString() } : {}) }]));
}

const isDate = (value: string | null): value is string => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** Codes of items in one category, newest first, optionally within a date range (WIB days). */
export async function codesInCategory(apiKeyId: string, type: MediaType, category: string, query: URLSearchParams, { limit, offset }: { limit: number; offset: number }) {
  const from = query.get("from"), to = query.get("to");
  const publishedAt = {
    ...(isDate(from) ? { gte: new Date(`${from}T00:00:00+07:00`) } : {}),
    ...(isDate(to) ? { lt: new Date(new Date(`${to}T00:00:00+07:00`).getTime() + 86_400_000) } : {}),
  };
  const where = { apiKeyId, type,
    ...(category === ANY_CATEGORY ? {} : category === LOW_CONFIDENCE_FILTER ? { manual: false, confidence: { lt: LOW_CONFIDENCE } } : { category }), ...(Object.keys(publishedAt).length ? { publishedAt } : {}) };
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

/** Request filters besides date and sort; when present, an AI category filter is combined in the source database. */
const EXTRA_FILTERS = ["q", "source", "mood", "lang", "analyzed", "province", "category", "postType", "level", "image", "relevance"];
export const hasExtraFilters = (query: URLSearchParams) => EXTRA_FILTERS.some((k) => !!query.get(k));

/** Most labelled codes considered when combining an AI category with other filters. */
const COMBINE_CAP = 50_000;

// Re-checking tens of thousands of labelled codes in the source database takes 10+ seconds (e.g. a key with
// "analysed only" on every request). The matches per key and filter set are kept for a few minutes and then
// refreshed in the background, so only the very first request waits; new labels show up within that window.
const combinedCache = sharedCache<string[]>("ai.combined", { ttlMs: 5 * 60_000, maxEntries: 200, staleWhileRevalidate: true });

/**
 * Items in an AI category that also match the other request filters, in timeline order: total, one page of
 * codes, and all matching codes (for summaries). Labels give the candidates; the source database filters them.
 */
export async function categoryWithFilters(apiKeyId: string, type: MediaType, category: string, query: URLSearchParams, scope: KeyScope, { limit, offset }: { limit: number; offset: number }) {
  const key = [apiKeyId, category, query.get("sort") ?? "", filterKey(type, query, scope)].join("|");
  const matching = await combinedCache(key, async () => {
    const candidates = await codesInCategory(apiKeyId, type, category, query, { limit: COMBINE_CAP, offset: 0 });
    return filterCodes(type, query, scope, candidates.codes);
  });
  return { total: matching.length, codes: matching.slice(offset, offset + limit), all: matching };
}

/**
 * One page of an AI category (or "any labelled"), honouring the other request filters when there are any.
 * `all` holds every matching code when filters were combined (capped), for summaries.
 */
export async function categoryPage(apiKeyId: string, type: MediaType, category: string, query: URLSearchParams, scope: KeyScope, page: { limit: number; offset: number }) {
  // Labels were made within the key's keywords, but the rest of its scope (e.g. "analysed only") can change or be
  // turned on later, so it is checked in the source database whenever it restricts anything.
  if (hasExtraFilters(query) || hasExtraRestrictions(scope)) return categoryWithFilters(apiKeyId, type, category, query, scope, page);
  const plain = await codesInCategory(apiKeyId, type, category, query, page);
  return { ...plain, all: null as string[] | null };
}

/**
 * Labelled items per period and category (WIB calendar), for trend charts. `from`/`to` (YYYY-MM-DD) limit the
 * publish dates; default is the last 12 weeks (or 30 days for daily).
 */
export async function categoryTrend(apiKeyId: string, type: MediaType, categories: Category[], interval: "day" | "week", query: URLSearchParams) {
  const from = query.get("from"), to = query.get("to");
  const start = isDate(from) ? new Date(`${from}T00:00:00+07:00`) : new Date(Date.now() - (interval === "week" ? 84 : 30) * 86_400_000);
  const end = isDate(to) ? new Date(new Date(`${to}T00:00:00+07:00`).getTime() + 86_400_000) : new Date();
  const rows = await prisma.$queryRaw<{ period: Date; category: string; n: bigint }[]>`
    SELECT date_trunc(${interval}, ("publishedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta') AS period, category, count(*) AS n
    FROM "Classification"
    WHERE "apiKeyId" = ${apiKeyId} AND type = ${type} AND "publishedAt" >= ${start} AND "publishedAt" < ${end}
    GROUP BY 1, 2 ORDER BY 1`;
  const periods = [...new Set(rows.map((r) => r.period.toISOString().slice(0, 10)))];
  const codes = [...categories.map((c) => c.code), NO_CATEGORY];
  return {
    interval,
    categories: codes.map((code) => ({ code, label: labelOf(categories, code) })),
    periods: periods.map((period) => ({
      period,
      counts: Object.fromEntries(codes.map((code) => [code, Number(rows.find((r) => r.period.toISOString().slice(0, 10) === period && r.category === code)?.n ?? 0)])),
    })),
  };
}
