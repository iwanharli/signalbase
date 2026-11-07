import { NextResponse } from "next/server";
import { allowsType, OPEN_SCOPE, parseKeyScope, type KeyScope } from "@/lib/media/keyScope";
import { isMediaType } from "@/lib/media/types";
import { classificationsFor, codesInCategory, keyCategories } from "@/lib/server/ai/classifications";
import { adminRoute } from "@/lib/server/auth";
import { countExact, fetchItemsByCode, filterOptions, listItems, moodBreakdown } from "@/lib/server/bank";
import { socialMetadata } from "@/lib/server/bank/socialMetadata";
import { prisma } from "@/lib/server/db";

const PAGE_SIZE = 24;

type Context = { params: Promise<{ type: string }> };

/** The scope to browse with: the whole bank, or one API key's view of it when ?key= is given. */
async function resolveScope(keyId: string | null): Promise<{ scope: KeyScope; keyId: string | null } | { error: string; status: number }> {
  if (!keyId) return { scope: OPEN_SCOPE, keyId: null };
  const key = await prisma.apiKey.findUnique({ where: { id: keyId }, select: { id: true, scope: true, keywords: true } });
  if (!key) return { error: "Kunci tidak ditemukan", status: 404 };
  return { scope: parseKeyScope(key.scope, key.keywords), keyId: key.id };
}

// Panel browser over the bank, optionally as seen through one API key (?key=).
//   ?view=options → filter choices
//   ?view=count   → exact total (slow, cached; fetched separately so the list isn't blocked)
//   otherwise     → one page of items, plus the mood breakdown on page 1
// With a key that has AI categorisation, items carry `classification` and ?aiCategory= filters by it.
export const GET = adminRoute(async (req: Request, { params }: Context) => {
  const { type } = await params;
  if (!isMediaType(type)) return NextResponse.json({ error: "Jenis tidak dikenal" }, { status: 404 });
  const query = new URL(req.url).searchParams;

  try {
    if (query.get("view") === "options") return NextResponse.json(await filterOptions(type));

    const resolved = await resolveScope(query.get("key"));
    if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    const { scope, keyId } = resolved;
    if (!allowsType(scope, type)) return NextResponse.json({ error: `Kunci ini tidak punya akses ke media ${type === "social" ? "sosial" : "online"}` }, { status: 403 });

    const categories = keyId ? await keyCategories(keyId) : null;
    const aiCategory = categories ? query.get("aiCategory") : null;
    const page = Math.max(1, Math.floor(Number(query.get("page"))) || 1);

    if (query.get("view") === "count") {
      if (aiCategory) return NextResponse.json({ total: (await codesInCategory(keyId!, type, aiCategory, query, { limit: 0, offset: 0 })).total });
      return NextResponse.json({ total: await countExact(type, query, scope) });
    }

    // The breakdown ignores the mood filter so every slice stays visible.
    const withoutMood = new URLSearchParams(query);
    withoutMood.delete("mood");
    const moods = page === 1 ? moodBreakdown(type, withoutMood, scope) : Promise.resolve(null);

    let items, hasMore;
    if (aiCategory) {
      // Category pages come from the stored labels; only the date range and sort apply.
      const { total, codes } = await codesInCategory(keyId!, type, aiCategory, query, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
      items = await fetchItemsByCode(type, codes);
      hasMore = page * PAGE_SIZE < total;
    } else {
      // One extra row tells whether another page exists without counting.
      const rows = await listItems(type, query, scope, { limit: PAGE_SIZE + 1, offset: (page - 1) * PAGE_SIZE });
      items = rows.slice(0, PAGE_SIZE);
      hasMore = rows.length > PAGE_SIZE;
    }

    const codes = items.map((item) => item.code);
    const [labels, metadata] = await Promise.all([
      categories ? classificationsFor(keyId!, type, codes, categories, type === "social") : null,
      type === "social" ? socialMetadata(codes, keyId ? scope.keywords : []) : null,
    ]);
    return NextResponse.json({
      page, hasMore, moods: await moods,
      items: items.map((item) => ({
        ...item,
        ...(labels ? { classification: labels.get(item.code) ?? null } : {}),
        ...(metadata?.has(item.code) ? { socialMetadata: metadata.get(item.code) } : {}),
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
});
