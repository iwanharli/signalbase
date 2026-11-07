import { NextResponse } from "next/server";
import { allowsType } from "@/lib/media/keyScope";
import { resolveMediaType, type MediaItem, type MediaType } from "@/lib/media/types";
import { categoryBreakdown, classificationsFor, codesInCategory, effectiveCategoryFilter, keyCategories } from "@/lib/server/ai/classifications";
import { apiRoute, type ApiCaller } from "@/lib/server/apiKey";
import { countCapped, fetchItemsByCode, filterOptions, listItems, moodBreakdown, moodsForCodes } from "@/lib/server/bank";

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 100;

type Context = { params: Promise<{ type: string }> };

// Public read API over the source database, limited to the API key's scope (keywords and fixed filters).
//   GET /api/v1/media/{social|online}?from=&to=&q=&source=&mood=&sort=&page=&size=&…
//   GET /api/v1/media/{social|online}?aiCategory=QW3&from=&to=&sort=&page=&size=   items in one AI category
//   GET /api/v1/media/{social|online}?view=summary&…   total + split by mood (+ AI categories)
//   GET /api/v1/media/{social|online}?view=options     choices for filter dropdowns (sources, provinces, moods, post types)
// Totals are capped at COUNT_CAP to keep every request fast; `capped` says when that happened.
export const GET = apiRoute(async (req: Request, { params }: Context, { keyId, scope }: ApiCaller) => {
  const type = resolveMediaType((await params).type);
  if (!type) return NextResponse.json({ error: "Jenis tidak dikenal: pakai social atau online" }, { status: 404 });
  if (!allowsType(scope, type)) return NextResponse.json({ error: `Kunci ini tidak punya akses ke media ${type}` }, { status: 403 });
  const query = new URL(req.url).searchParams;

  try {
    const categories = await keyCategories(keyId, type);

    if (query.get("view") === "options") {
      const { sources, moods, provinces, postTypes } = await filterOptions(type);
      return NextResponse.json({ sources, moods, provinces, postTypes });
    }

    if (query.get("view") === "summary") {
      // A key that serves labelled items only, or an AI category filter: count and split those items.
      const labelledFilter = categories ? await effectiveCategoryFilter(keyId, query.get("aiCategory")) : null;
      if (labelledFilter) {
        const { total, codes } = await codesInCategory(keyId, type, labelledFilter, query, { limit: 10_000, offset: 0 });
        const [moods, aiCategories] = await Promise.all([moodsForCodes(type, codes), categoryBreakdown(keyId, type, categories!)]);
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
      // Category pages come from the stored labels; only the date range and sort apply here.
      if (!categories) return NextResponse.json({ error: "Kunci ini tidak memakai kategorisasi AI" }, { status: 400 });
      const result = await codesInCategory(keyId, type, aiCategory, query, { limit: size, offset: (requestedPage - 1) * size });
      total = result.total;
      items = await fetchItemsByCode(type, result.codes);
    } else {
      ({ total, capped } = await countCapped(type, query, scope));
      const lastPage = Math.max(1, Math.ceil(total / size));
      items = await listItems(type, query, scope, { limit: size, offset: (Math.min(requestedPage, lastPage) - 1) * size });
    }

    const pages = Math.max(1, Math.ceil(total / size));
    const page = Math.min(requestedPage, pages);
    const labels = categories ? await classificationsFor(keyId, type, items.map((i) => i.code), categories) : null;
    return NextResponse.json({ page, pages, size, total, capped, items: items.map((item) => toPublic(item, type, labels)) });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Sumber data tidak bisa dihubungi" }, { status: 502 });
  }
});

/** API shape of an item; `classification` is present (possibly null) only for keys with AI categorisation. */
function toPublic({ code, ...item }: MediaItem, type: MediaType, labels: Awaited<ReturnType<typeof classificationsFor>> | null) {
  return { id: code, type, ...item, ...(labels ? { classification: labels.get(code) ?? null } : {}) };
}
