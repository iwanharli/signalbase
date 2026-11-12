import { NextResponse } from "next/server";
import { allowsType } from "@/lib/media/keyScope";
import { isMediaType } from "@/lib/media/types";
import { categoryPage, classificationsFor, effectiveCategoryFilter, keyCategories } from "@/lib/server/ai/classifications";
import { adminRoute } from "@/lib/server/auth";
import { countExact, fetchItemsByCode, filterOptions, listItems, moodBreakdown } from "@/lib/server/bank";
import { sourceErrorResponse } from "@/lib/server/bank/errors";
import { accountPlan, clampHistory, EXPIRED_MESSAGE } from "@/lib/server/plan";
import { analysisForPlan } from "@/lib/media/planAnalysis";
import type { PlanLimits } from "@/lib/plans";
import { socialMetadata } from "@/lib/server/bank/socialMetadata";
import { resolveScope } from "@/lib/server/panelScope";

const PAGE_SIZE = 24;

type Context = { params: Promise<{ type: string }> };

// Panel browser over the bank, optionally as seen through one API key (?key=).
//   ?view=options → filter choices
//   ?view=count   → exact total (slow, cached; fetched separately so the list isn't blocked)
//   otherwise     → one page of items, plus the mood breakdown on page 1
// With a key that has AI categorisation, items carry `classification` and ?aiCategory= filters by it.
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
    const { scope, keyId } = resolved;
    if (!allowsType(scope, type)) return NextResponse.json({ error: `Proyek ini tidak punya akses ke media ${type === "social" ? "sosial" : "online"}` }, { status: 403 });

    const categories = keyId ? await keyCategories(keyId, type) : null;
    const aiCategory = categories ? await effectiveCategoryFilter(keyId!, query.get("aiCategory")) : null;
    const page = Math.max(1, Math.floor(Number(query.get("page"))) || 1);

    if (query.get("view") === "count") {
      if (aiCategory) return NextResponse.json({ total: (await categoryPage(keyId!, type, aiCategory, query, scope, { limit: 0, offset: 0 })).total });
      return NextResponse.json({ total: await countExact(type, query, scope) });
    }

    // The breakdown ignores the mood filter so every slice stays visible.
    const withoutMood = new URLSearchParams(query);
    withoutMood.delete("mood");
    const moods = page === 1 ? moodBreakdown(type, withoutMood, scope) : Promise.resolve(null);

    let items, hasMore;
    if (aiCategory) {
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
    const [labels, metadata] = await Promise.all([
      categories ? classificationsFor(keyId!, type, codes, categories, type === "social") : null,
      type === "social" ? socialMetadata(codes, keyId ? scope.keywords : []) : null,
    ]);
    return NextResponse.json({
      page, hasMore, moods: await moods,
      items: items.map((item) => ({
        ...analysisForPlan(item, analysisLevel),
        ...(labels ? { classification: labels.get(item.code) ?? null } : {}),
        ...(metadata?.has(item.code) ? { socialMetadata: metadata.get(item.code) } : {}),
      })),
    });
  } catch (e) {
    return sourceErrorResponse(e, `media/${type}`);
  }
});
