// Data behind the Ringkasan / Beranda page, per media type: 14 days of volume, the 7-day mood split, the newest items.
// Cached per scope and served stale while it refreshes; warmOverview() keeps the whole bank and every active key ready.
import { allowsType, OPEN_SCOPE, parseKeyScope, type KeyScope } from "@/lib/media/keyScope";
import type { DailyCount, MediaItem, MediaType, MoodCount } from "@/lib/media/types";
import { countExact, dailyVolume, filterOptions, listItems, moodBreakdown } from "./bank";
import { sharedCache } from "./bank/cache";
import { filterKey } from "./bank/query";
import { prisma } from "./db";
import { berandaScope, typeInsights } from "./insights";
import { withImageCodes } from "./media/textSignals";
import { snaGraph } from "./bank/sna";
import { snaIssueGraph } from "./issueClusters/sna";
import { DEFAULT_SNA_LIMIT } from "@/lib/sna";
import { KEYWORD_RANGES, keywordCounts, MANY_KEYWORDS } from "./keywordCounts";
import { usesMatches } from "./projectMatches";

export type TypeStats = { daily: DailyCount[]; moods: MoodCount[]; latest: MediaItem[] };

/** Latest signals on Beranda: news headlines are short; the page shows as many as fit beside the social card. */
const LATEST_PER_TYPE = { social: 4, online: 12 } as const;
/** The media page's first request (one extra row tells whether a next page exists); must match the media route. */
const MEDIA_FIRST_PAGE = 25;
const WARM_EVERY_MS = 90_000;
/** Only warm-ups slower than this are logged, so the log stays quiet. */
const SLOW_WARM_MS = 20_000;

const cache = sharedCache<TypeStats>("overview", { ttlMs: 60_000, maxEntries: 100, staleWhileRevalidate: true });

/**
 * Stats for one media type: the whole bank when `scope` is undefined, else one key's view. null when the key excludes the type.
 * `days` (Command Center) sets both the volume window and the mood window; without it: 14 days of volume, 7 days of moods.
 */
export function typeStats(type: MediaType, scope?: KeyScope, days?: number): Promise<TypeStats> | null {
  if (scope && !allowsType(scope, type)) return null;
  const s = scope ?? OPEN_SCOPE;
  return cache((scope ? filterKey(type, new URLSearchParams(), s) : `${type}|bank`) + (days ? `|d${days}` : ""), async () => {
    const weekStart = new Date(Date.now() - ((days ?? 7) - 1) * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
    const [daily, moods, latest] = await Promise.all([
      dailyVolume(type, days ?? 14, scope),
      moodBreakdown(type, new URLSearchParams({ from: weekStart }), s),
      // Latest signals as the media pages list them by default (analysed, and for social not marked not relevant).
      listItems(type, new URLSearchParams(), berandaScope(type, s), { limit: LATEST_PER_TYPE[type], offset: 0 }),
    ]);
    return { daily, moods, latest };
  });
}

/** One warming step: a failure (a timed-out count) is logged with its name and the rest of the run carries on. */
async function step(name: string, run: () => Promise<unknown>) {
  try { await run(); } catch (e) { console.warn(`[overview] warm ${name} failed: ${(e as Error).message}`); }
}

/** Overview and default 7-day insights, then the 14- and 30-day ones (a cold 30-day social scan takes ~25 s).
 *  Whole bank first, then each active key one at a time (keyword searches are heavy; this keeps the source DB calm).
 *  Each project's SNA (issue view of 7 days and the mention graph of 1 day, as the page opens) is warmed too. */
async function warmAll() {
  // Filter choices first: every media page asks for them, and cold they take ~13 s.
  await step("filter options", () => Promise.all([filterOptions("social"), filterOptions("online")]));
  await step("bank stats", () => Promise.all([typeStats("social"), typeStats("online")]));
  await step("bank insights 7", () => Promise.all([typeInsights("social", 7), typeInsights("online", 7)]));
  await step("bank sna", () => snaGraph(1, DEFAULT_SNA_LIMIT));
  const keys = await prisma.project.findMany({ where: { revokedAt: null }, select: { id: true, name: true, scope: true, keywords: true } });
  // With the items each project matches by image text, so the warmed caches are the ones its pages ask for.
  const scopes = await Promise.all(keys.map((key) => withImageCodes(key.id, parseKeyScope(key.scope, key.keywords))));
  // A long keyword list is searched in minutes until its matches are stored (projectMatches.ts): not warmed until then,
  // so the warm-up does not keep the source database busy with searches that time out.
  // Waiting = its stored matches do not reach back the 30 days the warm-up asks for yet.
  const month = new Date(Date.now() - 30 * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  const waiting = (i: number) => usesMatches(keys[i].keywords)
    && !Object.values(scopes[i].matched ?? {}).some((m) => m && m.coverFrom <= month);
  for (const [i, scope] of scopes.entries()) {
    const name = keys[i].name;
    if (waiting(i)) continue;
    await step(`${name} stats`, () => Promise.all([typeStats("social", scope), typeStats("online", scope)]));
    await step(`${name} insights 7`, () => Promise.all([typeInsights("social", 7, scope), typeInsights("online", 7, scope)]));
    await step(`${name} media`, () => warmMediaPages(scope));
    // SNA as the page opens it (issue view: 10 and 25 accounts per issue; mention view: 1, 3 and 7 days).
    for (const limit of [25, 50] as const) await step(`${name} sna isu ${limit}`, () => snaIssueGraph(keys[i].id, 7, limit, null, null));
    for (const days of [1, 3, 7] as const) await step(`${name} sna mention ${days}`, () => snaGraph(days, DEFAULT_SNA_LIMIT, scope));
    // The Kata kunci tab's counts per keyword.
    // A long keyword list (minutes to count) warms only the tab's default range.
    for (const days of keys[i].keywords.length >= MANY_KEYWORDS ? [30] : KEYWORD_RANGES) await step(`${name} kata kunci ${days}`, () => keywordCounts(keys[i].id, days));
  }
  for (const period of [30, 14]) {
    for (const [i, scope] of [undefined, ...scopes].entries()) {
      if (i && waiting(i - 1)) continue;
      await step(`${i ? keys[i - 1].name : "bank"} insights ${period}`, () => Promise.all([typeInsights("social", period, scope), typeInsights("online", period, scope)]));
    }
  }
}

/** Jakarta date `days` before today, as the media page's quick ranges send it (YYYY-MM-DD). */
const jakartaDaysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
/** The media page's quick ranges (lib/media/filters DATE_PRESETS): Semua, 1 hari, 7 hari, 30 hari. */
const RANGE_DAYS = [null, 0, 6, 29] as const;

/** A project's Media Sosial/Online as they are opened: the first page, the exact total and the mood bar, for every quick
 *  range, with exactly the parameters the page sends (its default filters: analysed only, and relevant only for social),
 *  so the warmed caches are the ones it reads. Broad keywords make the all-time total and moods take 10–50 s cold; caches
 *  refresh in the background, so this only waits for real work when they are missing. */
async function warmMediaPages(scope: KeyScope) {
  for (const type of ["social", "online"] as const) {
    if (!allowsType(scope, type)) continue;
    for (const days of RANGE_DAYS) {
      const params = new URLSearchParams({ analyzed: "yes", ...(type === "social" ? { relevance: "relevant" } : {}), ...(days === null ? {} : { from: jakartaDaysAgo(days) }) });

      const list = new URLSearchParams(params);
      list.set("sort", "newest");
      const label = `media ${type} ${days === null ? "semua" : `${days + 1} hari`}`;
      // Separate steps: one slow count (a broad project's all-time mood) does not leave the others cold.
      await step(`${label} list`, () => listItems(type, list, scope, { limit: MEDIA_FIRST_PAGE, offset: 0 }));
      await step(`${label} count`, () => countExact(type, params, scope));
      await step(`${label} moods`, () => moodBreakdown(type, params, scope));
    }
  }
}

/** Keeps every overview (admin's whole bank and each key's Beranda) computed in the background, so opening one never waits
 *  on the source DB. Runs once per server process; a run that is still busy is not started twice. */
export function warmOverview() {
  const g = globalThis as unknown as { overviewWarmer?: NodeJS.Timeout };
  if (g.overviewWarmer) return;
  let running = false;
  const warm = async () => {
    if (running) return;
    running = true;
    const started = Date.now();
    try {
      await warmAll();
      const took = Date.now() - started;
      if (took > SLOW_WARM_MS) console.warn(`[overview] slow warm-up: ${took} ms`);
    } catch (e) { console.warn("[overview] warm failed:", (e as Error).message); } finally { running = false; }
  };
  void warm();
  g.overviewWarmer = setInterval(warm, WARM_EVERY_MS);
  g.overviewWarmer.unref?.();
}
