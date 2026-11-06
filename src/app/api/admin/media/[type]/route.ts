import { NextResponse } from "next/server";
import { OPEN_SCOPE } from "@/lib/media/keyScope";
import { isMediaType } from "@/lib/media/types";
import { adminRoute } from "@/lib/server/auth";
import { countExact, filterOptions, listItems, moodBreakdown } from "@/lib/server/bank";

const PAGE_SIZE = 24;

type Context = { params: Promise<{ type: string }> };

// Panel browser over the whole bank (no keyword scope).
//   ?view=options → filter choices
//   ?view=count   → exact total (slow, cached; fetched separately so the list isn't blocked)
//   otherwise     → one page of items, plus the mood breakdown on page 1
export const GET = adminRoute(async (req: Request, { params }: Context) => {
  const { type } = await params;
  if (!isMediaType(type)) return NextResponse.json({ error: "Jenis tidak dikenal" }, { status: 404 });
  const query = new URL(req.url).searchParams;

  try {
    if (query.get("view") === "options") return NextResponse.json(await filterOptions(type));
    if (query.get("view") === "count") return NextResponse.json({ total: await countExact(type, query, OPEN_SCOPE) });

    const page = Math.max(1, Math.floor(Number(query.get("page"))) || 1);
    // The breakdown ignores the mood filter so every slice stays visible.
    const withoutMood = new URLSearchParams(query);
    withoutMood.delete("mood");
    // One extra row tells whether another page exists without counting.
    const [rows, moods] = await Promise.all([
      listItems(type, query, OPEN_SCOPE, { limit: PAGE_SIZE + 1, offset: (page - 1) * PAGE_SIZE }),
      page === 1 ? moodBreakdown(type, withoutMood, OPEN_SCOPE) : null,
    ]);
    return NextResponse.json({ page, hasMore: rows.length > PAGE_SIZE, moods, items: rows.slice(0, PAGE_SIZE) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
});
