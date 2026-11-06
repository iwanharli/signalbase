import { NextResponse } from "next/server";
import { allowsType, type KeyScope } from "@/lib/media/keyScope";
import { resolveMediaType } from "@/lib/media/types";
import { apiRoute } from "@/lib/server/apiKey";
import { countCapped, listItems, moodBreakdown } from "@/lib/server/bank";

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 100;

type Context = { params: Promise<{ type: string }> };

// Public read API over the source database, limited to the API key's scope (keywords and fixed filters).
//   GET /api/v1/media/{social|online}?from=&to=&q=&source=&mood=&sort=&page=&size=&…
//   GET /api/v1/media/{social|online}?view=summary&…   total + split by mood
// Totals are capped at COUNT_CAP to keep every request fast; `capped` says when that happened.
export const GET = apiRoute(async (req: Request, { params }: Context, scope: KeyScope) => {
  const type = resolveMediaType((await params).type);
  if (!type) return NextResponse.json({ error: "Jenis tidak dikenal: pakai social atau online" }, { status: 404 });
  if (!allowsType(scope, type)) return NextResponse.json({ error: `Kunci ini tidak punya akses ke media ${type}` }, { status: 403 });
  const query = new URL(req.url).searchParams;

  try {
    if (query.get("view") === "summary") {
      // The split ignores the mood filter so every slice stays visible; the total honours it.
      const withoutMood = new URLSearchParams(query);
      withoutMood.delete("mood");
      const [{ total, capped }, moods] = await Promise.all([countCapped(type, query, scope), moodBreakdown(type, withoutMood, scope)]);
      return NextResponse.json({ total, capped, moods });
    }

    const size = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(query.get("size")) || DEFAULT_PAGE_SIZE));
    const { total, capped } = await countCapped(type, query, scope);
    const pages = Math.max(1, Math.ceil(total / size));
    const page = Math.min(Math.max(1, Number(query.get("page")) || 1), pages);
    const items = await listItems(type, query, scope, { limit: size, offset: (page - 1) * size });
    return NextResponse.json({ page, pages, size, total, capped, items: items.map(({ code, ...item }) => ({ id: code, type, ...item })) });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Sumber data tidak bisa dihubungi" }, { status: 502 });
  }
});
