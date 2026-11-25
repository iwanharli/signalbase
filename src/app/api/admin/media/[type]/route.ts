import { NextResponse } from "next/server";
import { allowsType } from "@/lib/media/keyScope";
import { isMediaType } from "@/lib/media/types";
import { categoryPage, classificationsFor, effectiveCategoryFilter, keyCategories } from "@/lib/server/ai/classifications";
import { adminRoute } from "@/lib/server/auth";
import { labelPage, manualLabelsFor } from "@/lib/server/manualLabels";
import { countExact, fetchItemsByCode, filterCodes, filterOptions, listItems, moodBreakdown } from "@/lib/server/bank";
import { sourceErrorResponse } from "@/lib/server/bank/errors";
import { accountPlan, clampHistory, EXPIRED_MESSAGE } from "@/lib/server/plan";
import { analysisForPlan } from "@/lib/media/planAnalysis";
import type { PlanLimits } from "@/lib/plans";
import { socialMetadata } from "@/lib/server/bank/socialMetadata";
import { resolveScope } from "@/lib/server/panelScope";
import { withImageSearch } from "@/lib/server/media/textSignals";

const PAGE_SIZE = 24;

type Context = { params: Promise<{ type: string }> };

// Panel browser over the bank, optionally as seen through one API key (?key=).
//   ?view=options → filter choices
//   ?view=count   → exact total (slow, cached; fetched separately so the list isn't blocked)
//   ?view=moods   → the mood breakdown (slow on broad scopes, cached; fetched separately for the same reason)
//   otherwise     → one page of items
// With a key that has AI categorisation, items carry `classification` and ?aiCategory= filters by it. With a key, items
// also carry `manualLabel` (the project's manual label, or null).
export const GET = adminRoute(async (req: Request, { params }: Context, _username, user) => {
  const { type } = await params;
  if (!isMediaType(type)) return NextResponse.json({ error: "Jenis tidak dikenal" }, { status: 404 });
  let query = new URL(req.url).searchParams;

  try {
    if (query.get("view") === "options") return NextResponse.json(await filterOptions(type));

    // Users read within their plan: nothing once it has ended, only its history window, and its analysis level.
    let analysisLevel: PlanLimits["analysis"] = "full";
    if (user.role === "user") {
      const plan = await accountPlan(user.id);
      analysisLevel = plan.limits.analysis;
      if (plan.expired) return NextResponse.json({ error: EXPIRED_MESSAGE, expired: true }, { status: 403 });
      query = clampHistory(query, plan.limits.historyDays);
    }

    const resolved = await resolveScope(query.get("key"), user);
    if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    const { keyId } = resolved;
    // A search also finds items whose image text matches it (media worker; nothing changes without ?q=).
    const scope = await withImageSearch(resolved.scope, query.get("q"));
    if (!allowsType(scope, type)) return NextResponse.json({ error: `Proyek ini tidak punya akses ke media ${type === "social" ? "sosial" : "online"}` }, { status: 403 });

    const categories = keyId ? await keyCategories(keyId, type) : null;
    const aiCategory = categories ? await effectiveCategoryFilter(keyId!, query.get("aiCategory")) : null;
    const page = Math.max(1, Math.floor(Number(query.get("page"))) || 1);
    // Manual label filter (?label=, only through a project); combined with the AI category when both are set.
    const manualLabel = keyId ? query.get("label") : null;

    if (query.get("view") === "count") {
      if (manualLabel) return NextResponse.json({ total: (await labelPage(keyId!, type, manualLabel, query, scope, { limit: 0, offset: 0 }, aiCategory)).total });
      if (aiCategory) return NextResponse.json({ total: (await categoryPage(keyId!, type, aiCategory, query, scope, { limit: 0, offset: 0 })).total });
      return NextResponse.json({ total: await countExact(type, query, scope) });
    }

    if (query.get("view") === "moods") {
      // The breakdown ignores the mood filter so every slice stays visible.
      const withoutMood = new URLSearchParams(query);
      withoutMood.delete("mood");
      return NextResponse.json({ moods: await moodBreakdown(type, withoutMood, scope) });
    }

    let items, hasMore;
    if (manualLabel) {
      const { total, codes } = await labelPage(keyId!, type, manualLabel, query, scope, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }, aiCategory);
      items = await fetchItemsByCode(type, codes);
      hasMore = page * PAGE_SIZE < total;
    } else if (aiCategory) {
      // Category pages come from the stored labels, combined with any other filters in the source database.
      const { total, codes } = await categoryPage(keyId!, type, aiCategory, query, scope, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
      items = await fetchItemsByCode(type, codes);
      hasMore = page * PAGE_SIZE < total;
    } else {
      // One extra row tells whether another page exists without counting.
      const rows = await listItems(type, query, scope, { limit: PAGE_SIZE + 1, offset: (page - 1) * PAGE_SIZE });
      items = rows.slice(0, PAGE_SIZE);
      hasMore = rows.length > PAGE_SIZE;
    }

    const codes = items.map((item) => item.code);
    const [labels, metadata, manual] = await Promise.all([
      categories ? classificationsFor(keyId!, type, codes, categories, type === "social") : null,
      type === "social" ? socialMetadata(codes, keyId ? scope.keywords : []) : null,
      // Manual labels of the project (separate from AI categorisation).
      keyId ? manualLabelsFor(keyId, type, codes) : null,
    ]);
    // "Kata kunci di gambar": on the page, items the project matches by image text whose own text doesn't match.
    const viaImage = items.map((i) => i.code).filter((c) => scope.imageCodes?.[type]?.includes(c));
    const captionMatched = viaImage.length
      ? new Set(await filterCodes(type, new URLSearchParams(), { ...scope, imageCodes: undefined, imageSearch: undefined }, viaImage))
      : new Set<string>();
    const byImage = new Set(viaImage.filter((c) => !captionMatched.has(c)));
    return NextResponse.json({
      page, hasMore,
      items: items.map((item) => ({
        ...(byImage.has(item.code) ? { matchedByImage: true } : {}),
        ...analysisForPlan(item, analysisLevel),
        ...(labels ? { classification: labels.get(item.code) ?? null } : {}),
        ...(manual ? { manualLabel: manual.get(item.code) ?? null } : {}),
        ...(metadata?.has(item.code) ? { socialMetadata: metadata.get(item.code) } : {}),
      })),
    });
  } catch (e) {
    return sourceErrorResponse(e, `media/${type}`);
  }
});
