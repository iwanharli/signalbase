import { NextResponse } from "next/server";
import { allowsType } from "@/lib/media/keyScope";
import { resolveMediaType, type MediaItem, type MediaType } from "@/lib/media/types";
import { categoryBreakdown, categoryPage, categoryTrend, classificationsFor, effectiveCategoryFilter, keyCategories } from "@/lib/server/ai/classifications";
import { apiRoute, type ApiCaller } from "@/lib/server/apiKey";
import { sourceErrorResponse } from "@/lib/server/bank/errors";
import { countCapped, fetchItemsByCode, filterOptions, listItems, moodBreakdown, moodsForCodes } from "@/lib/server/bank";
import { matchedKeywords } from "@/lib/server/bank/socialMetadata";

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 100;

type Context = { params: Promise<{ type: string }> };

// Public read API over the source database, limited to the API key's scope (keywords and fixed filters).
//   GET /api/v1/media/{social|online}?from=&to=&q=&source=&mood=&sort=&page=&size=&…
//   GET /api/v1/media/{social|online}?aiCategory=QW3&from=&to=&sort=&page=&size=   items in one AI category
//   GET /api/v1/media/{social|online}?view=summary&…   total + split by mood (+ AI categories)
//   GET /api/v1/media/{social|online}?view=options     choices for filter dropdowns (sources, provinces, moods, post types)
//   GET /api/v1/media/{social|online}?view=trend&interval=week|day&from=&to=   labelled items per period and AI category
// Totals are capped at COUNT_CAP to keep every request fast; `capped` says when that happened.
export const GET = apiRoute(async (req: Request, { params }: Context, { keyId, scope }: ApiCaller) => {
  const type = resolveMediaType((await params).type);
  if (!type) return NextResponse.json({ error: "Jenis tidak dikenal: pakai social atau online" }, { status: 404 });
  if (!allowsType(scope, type)) return NextResponse.json({ error: `Kunci ini tidak punya akses ke media ${type}` }, { status: 403 });
  const query = new URL(req.url).searchParams;

  try {
    const categories = await keyCategories(keyId, type);

    if (query.get("view") === "trend") {
      if (!categories) return NextResponse.json({ error: "Kunci ini tidak memakai kategorisasi AI" }, { status: 400 });
      return NextResponse.json(await categoryTrend(keyId, type, categories, query.get("interval") === "day" ? "day" : "week", query));
    }

    if (query.get("view") === "options") {
      const { sources, moods, provinces, postTypes } = await filterOptions(type);
      return NextResponse.json({ sources, moods, provinces, postTypes });
    }

    if (query.get("view") === "summary") {
      // A key that serves labelled items only, or an AI category filter: count and split those items.
      const labelledFilter = categories ? await effectiveCategoryFilter(keyId, query.get("aiCategory")) : null;
      if (labelledFilter) {
        const { total, codes, all } = await categoryPage(keyId, type, labelledFilter, query, scope, { limit: 10_000, offset: 0 });
        const [moods, aiCategories] = await Promise.all([moodsForCodes(type, (all ?? codes).slice(0, 10_000)), categoryBreakdown(keyId, type, categories!)]);
        return NextResponse.json({ total, capped: false, moods, aiCategories });
      }
      // The split ignores the mood filter so every slice stays visible; the total honours it.
      const withoutMood = new URLSearchParams(query);
      withoutMood.delete("mood");
      const [{ total, capped }, moods, aiCategories] = await Promise.all([
        countCapped(type, query, scope),
        moodBreakdown(type, withoutMood, scope),
        categories ? categoryBreakdown(keyId, type, categories) : null,
      ]);
      return NextResponse.json({ total, capped, moods, ...(aiCategories ? { aiCategories } : {}) });
    }

    const size = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(query.get("size")) || DEFAULT_PAGE_SIZE));
    const requestedPage = Math.max(1, Number(query.get("page")) || 1);
    const aiCategory = categories ? await effectiveCategoryFilter(keyId, query.get("aiCategory")) : query.get("aiCategory");

    let total: number, capped = false, items: MediaItem[];
    if (aiCategory) {
      // Category pages come from the stored labels, combined with any other filters in the source database.
      if (!categories) return NextResponse.json({ error: "Kunci ini tidak memakai kategorisasi AI" }, { status: 400 });
      const result = await categoryPage(keyId, type, aiCategory, query, scope, { limit: size, offset: (requestedPage - 1) * size });
      total = result.total;
      items = await fetchItemsByCode(type, result.codes);
    } else {
      ({ total, capped } = await countCapped(type, query, scope));
      const lastPage = Math.max(1, Math.ceil(total / size));
      items = await listItems(type, query, scope, { limit: size, offset: (Math.min(requestedPage, lastPage) - 1) * size });
    }

    const pages = Math.max(1, Math.ceil(total / size));
    const page = Math.min(requestedPage, pages);
    const codes = items.map((i) => i.code);
    const [labels, matches] = await Promise.all([
      categories ? classificationsFor(keyId, type, codes, categories) : null,
      matchedKeywords(type, codes, scope.keywords),
    ]);
    return NextResponse.json({ page, pages, size, total, capped, items: items.map((item) => toPublic({ ...item, matchedKeywords: matches.get(item.code) ?? [] }, type, labels)) });
  } catch (e) {
    return sourceErrorResponse(e, `v1/${type}`);
  }
});

/** API shape of an item; `classification` is present (possibly null) only for keys with AI categorisation. */
function toPublic({ code, ...item }: MediaItem, type: MediaType, labels: Awaited<ReturnType<typeof classificationsFor>> | null) {
  return { id: code, type, ...item, ...(labels ? { classification: labels.get(code) ?? null } : {}) };
}
