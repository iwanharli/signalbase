// Posts and news per keyword of a project over the last 7, 30 or 90 days, within the project's other restrictions (the
// Kata kunci tab). Items that match only through the text in their image are left out of the per-keyword numbers.
// Shared by the route and the overview warmer, so the tab opens from cache.
import { allowsType, parseKeyScope, type KeyScope } from "@/lib/media/keyScope";
import { groupKeywords, parseKeywordGroups } from "@/lib/media/keywordGroups";
import { MEDIA_TYPES, type MediaType } from "@/lib/media/types";
import { sharedCache } from "./bank/cache";
import { REQUEST_TIMEOUT_MS, withLongTimeout } from "./bank/pool";
import { buildWhere, COLUMNS, keywordQuery } from "./bank/query";
import { prisma } from "./db";

export const KEYWORD_RANGES = [7, 30, 90] as const;
/** Long lists (MANY_KEYWORDS, projectMatches.ts) are counted one small indexed query per keyword (and per group), in the
 *  background; Beranda skips the per-keyword breakdown for them. */
export { MANY_KEYWORDS } from "./projectMatches";
import { MANY_KEYWORDS } from "./projectMatches";
const MANY_TIMEOUT_MS = 5 * 60_000;
const PARALLEL = 3;
type Counts = { keyword: string; social: number | null; online: number | null }[];
type GroupCounts = { name: string; social: number | null; online: number | null }[];
export type KeywordCounts = { days: number; from: string; keywords: Counts; groups: GroupCounts; total: Record<MediaType, number | null>; pending?: boolean };

// Counting a broad keyword reads many posts (seconds), so results are kept 10 minutes and refreshed in the background.
const cache = sharedCache<{ keywords: Counts; groups: GroupCounts; total: Record<MediaType, number | null> }>("keywordCounts", { ttlMs: 10 * 60_000, maxEntries: 60, staleWhileRevalidate: true });

/** First day of the last `days` days (Jakarta), as YYYY-MM-DD for the `from` filter. */
const fromDay = (days: number) => new Date(Date.now() - (days - 1) * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

/** One scan per media type over the posts matching any keyword; each keyword, then each group of keywords (any of its
 *  keywords, a post once), is a FILTER count on that scan. */
async function countType(type: MediaType, scope: KeyScope, from: string, groups: string[][]) {
  const c = COLUMNS[type];
  const { where, values } = buildWhere(type, new URLSearchParams({ from }), scope);
  const columns = [...scope.keywords.map((k) => [k]), ...groups].map((ks) => {
    const q = keywordQuery(ks);
    if (!q) return "NULL::int";
    values.push(q);
    return `count(*) FILTER (WHERE ${c.search} @@ to_tsquery('indonesian', $${values.length}))::int`;
  });
  const { rows } = await withLongTimeout(REQUEST_TIMEOUT_MS, (client) => client.query<{ counts: (number | null)[]; total: number }>(
    `SELECT ARRAY[${columns.join(", ") || "NULL::int"}] counts, count(*)::int total FROM ${c.from} WHERE ${where}`, values));
  return rows[0];
}

/** Many keywords: one count per keyword and per group, each a small query the search index answers, PARALLEL at a time;
 *  `lists[i]` is the keywords counted together for column i (one keyword, or a group's keywords). */
async function countEach(type: MediaType, scope: KeyScope, from: string, lists: string[][]) {
  const c = COLUMNS[type];
  // The other restrictions of the scope, without its keywords (each count adds its own).
  const base = buildWhere(type, new URLSearchParams({ from }), { ...scope, keywords: [] });
  const counts: (number | null)[] = new Array(lists.length).fill(null);
  let next = 0;
  const worker = async () => {
    while (next < lists.length) {
      const i = next++;
      const q = keywordQuery(lists[i]);
      if (!q) continue;
      const { rows } = await withLongTimeout(MANY_TIMEOUT_MS, (client) => client.query<{ n: number }>(
        `SELECT count(*)::int n FROM ${c.from} WHERE ${base.where} AND ${c.search} @@ to_tsquery('indonesian', $${base.values.length + 1})`, [...base.values, q]));
      counts[i] = rows[0].n;
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  return counts;
}

/** null when the project does not exist. */
export async function keywordCounts(id: string, days: number): Promise<KeywordCounts | null> {
  const key = await prisma.project.findUnique({ where: { id }, select: { scope: true, keywords: true, keywordGroups: true } });
  if (!key) return null;
  const scope = parseKeyScope(key.scope, key.keywords);
  const from = fromDay(days);
  if (!scope.keywords.length) return { days, from, keywords: [], groups: [], total: { social: null, online: null } };
  const grouped = groupKeywords(scope.keywords, parseKeywordGroups(key.keywordGroups, scope.keywords));
  const result = await cache(`${id}|${days}|${from}|${JSON.stringify(scope)}|${JSON.stringify(grouped)}`, async () => {
    const many = scope.keywords.length >= MANY_KEYWORDS;
    const count = async (t: MediaType) => {
      if (!allowsType(scope, t)) return null;
      if (!many) return countType(t, scope, from, grouped.map((g) => g.keywords));
      const lists = [...scope.keywords.map((k) => [k]), ...grouped.map((g) => g.keywords), scope.keywords];
      const counts = await countEach(t, scope, from, lists);
      return { counts: counts.slice(0, -1), total: counts[counts.length - 1] ?? 0 };
    };
    // One media type after the other for a long list, so it never takes the whole analytics pool.
    const byType = many ? [] as Awaited<ReturnType<typeof count>>[] : await Promise.all(MEDIA_TYPES.map(count));
    if (many) for (const t of MEDIA_TYPES) byType.push(await count(t));
    const at = (t: MediaType) => byType[MEDIA_TYPES.indexOf(t)];
    const n = scope.keywords.length;
    return {
      keywords: scope.keywords.map((keyword, i) => ({ keyword, social: at("social")?.counts[i] ?? null, online: at("online")?.counts[i] ?? null })),
      groups: grouped.map((g, i) => ({ name: g.name, social: at("social")?.counts[n + i] ?? null, online: at("online")?.counts[n + i] ?? null })),
      total: { social: at("social")?.total ?? null, online: at("online")?.total ?? null },
    };
  });
  return { days, from, ...result };
}

/** For a page: a long list is counted in the background, so the request answers at once ("pending") and the next call
 *  gets the numbers; a short list is awaited as before. */
export async function keywordCountsForPage(id: string, days: number): Promise<KeywordCounts | null> {
  const key = await prisma.project.findUnique({ where: { id }, select: { keywords: true } });
  if (!key) return null;
  const work = keywordCounts(id, days);
  if (key.keywords.length < MANY_KEYWORDS) return work;
  const waited = await Promise.race([work, new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500))]);
  if (waited) return waited;
  work.catch(() => undefined); // keeps counting; a failure is retried on the next call
  return { days, from: fromDay(days), keywords: [], groups: [], total: { social: null, online: null }, pending: true };
}
