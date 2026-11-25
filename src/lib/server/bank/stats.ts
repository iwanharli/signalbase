// Counts and aggregates over the source database. All results are cached because the tables hold millions of rows.
import type { KeyScope } from "@/lib/media/keyScope";
import type { DailyCount, MediaType, MoodCount } from "@/lib/media/types";
import { sharedCache } from "./cache";
import { analyticsPool, bankPool, withLongTimeout } from "./pool";
import { buildWhere, COLUMNS, filterKey } from "./query";

/** Upper bound for the fast (capped) count the public API returns with every list. */
export const COUNT_CAP = 10_000;

// Both counts are served stale while they refresh: a broad scope (e.g. "polri") takes 7–15 s (up to a minute when the
// analytics pool is busy), so after the first time nobody waits for a count again. The capped count answers the public
// API (KIPERMAS) on every list request.
const exactCountCache = sharedCache<number>("bank.exactCount", { ttlMs: 15 * 60_000, maxEntries: 300, staleWhileRevalidate: true });
const cappedCountCache = sharedCache<{ total: number; capped: boolean }>("bank.cappedCount", { ttlMs: 5 * 60_000, maxEntries: 300, staleWhileRevalidate: true });
// Kept 10 minutes and refreshed in the background (and warmed for every project): over every match, a broad scope takes
// 5-25 s (SLOG POLRI 30 days 21 s, all data 25 s; 26 Nov 2026), so only the first look waits.
const moodCache = sharedCache<MoodCount[]>("bank.mood", { ttlMs: 10 * 60_000, maxEntries: 200, staleWhileRevalidate: true });

/** Exact number of matches. Can take ~20 s on the full social table, so it gets a 90 s timeout. */
export function countExact(type: MediaType, params: URLSearchParams, scope: KeyScope) {
  return exactCountCache(filterKey(type, params, scope), () => {
    const { where, values } = buildWhere(type, params, scope);
    return withLongTimeout(90_000, async (client) => {
      const { rows } = await client.query<{ n: string }>(`SELECT count(*) n FROM ${COLUMNS[type].from} WHERE ${where}`, values);
      return Number(rows[0].n);
    });
  });
}

/** Number of matches up to COUNT_CAP; `capped` is true when there are at least that many. Fast enough per API request. */
export function countCapped(type: MediaType, params: URLSearchParams, scope: KeyScope) {
  return cappedCountCache(filterKey(type, params, scope), async () => {
    const { where, values } = buildWhere(type, params, scope);
    const { rows } = await bankPool().query<{ n: number }>(
      `SELECT count(*)::int n FROM (SELECT 1 FROM ${COLUMNS[type].from} WHERE ${where} LIMIT ${COUNT_CAP}) t`, values);
    return { total: rows[0].n, capped: rows[0].n >= COUNT_CAP };
  });
}

/** Matches per emotion (social) or sentiment (online), over every match of the filters (not a sample: a sample of the newest
 *  posts only described the last few days of a broad range). Runs with a long timeout on its own connection, so a slow
 *  breakdown never takes the connections the item lists need. `sample` limits it to the newest matches instead: the public
 *  API keeps that (COUNT_CAP), since a client's own filter combinations would otherwise wait up to half a minute. */
export function moodBreakdown(type: MediaType, params: URLSearchParams, scope: KeyScope, sample?: number) {
  return moodCache(`${filterKey(type, params, scope)}|${sample ?? "all"}`, async () => {
    const c = COLUMNS[type];
    const { where, values } = buildWhere(type, params, scope);
    const labelled = `${c.mood} IS NOT NULL AND ${c.mood} <> ''`;
    const sql = sample
      ? `SELECT value, count(*)::int n FROM (
           SELECT lower(${c.mood}) value FROM ${c.from} WHERE ${where} ORDER BY ${c.timestamp} DESC LIMIT ${Math.floor(sample)}
         ) t WHERE value IS NOT NULL AND value <> '' GROUP BY 1 ORDER BY 2 DESC`
      : `SELECT lower(${c.mood}) value, count(*)::int n FROM ${c.from} WHERE ${where} AND ${labelled} GROUP BY 1 ORDER BY 2 DESC`;
    const { rows } = await withLongTimeout(120_000, (client) => client.query<MoodCount>(sql,
      values,
    ));
    return rows;
  });
}

/** Calendar date (YYYY-MM-DD) in Jakarta, `offset` days from today. */
const jakartaDay = (offset = 0) => new Date(Date.now() + offset * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

/** Items per day from `from` to `to` (inclusive): the whole bank, or one key's scope when given. */
async function countPerDay(type: MediaType, from: string, to: string, scope?: KeyScope): Promise<DailyCount[]> {
  if (!scope) {
    // Whole bank: the plain table, no analysis join, so the timestamp index does all the work.
    const [table, ts] = type === "social" ? ["post_main", "post_timestamps"] : ["news_main", "news_timestamp"];
    const { rows } = await analyticsPool().query<DailyCount>(
      `SELECT to_char(${ts}::date, 'YYYY-MM-DD') AS day, count(*)::int AS n FROM ${table}
       WHERE ${ts} >= $1::date AND ${ts} < $2::date + 1 AND ${ts} <= now() GROUP BY 1 ORDER BY 1`, [from, to]);
    return rows;
  }
  const c = COLUMNS[type];
  const { where, values } = buildWhere(type, new URLSearchParams({ from, to }), scope);
  const { rows } = await analyticsPool().query<DailyCount>(
    `SELECT to_char(${c.timestamp}::date, 'YYYY-MM-DD') AS day, count(*)::int AS n FROM ${c.from} WHERE ${where} GROUP BY 1 ORDER BY 1`, values);
  return rows;
}

// Finished days never change, so they are counted once per calendar day (the key includes the date);
// only today is recounted, briefly cached and refreshed in the background.
const closedDaysCache = sharedCache<DailyCount[]>("bank.closedDays", { ttlMs: 24 * 60 * 60_000, maxEntries: 200 });
const todayCache = sharedCache<DailyCount[]>("bank.today", { ttlMs: 2 * 60_000, maxEntries: 200, staleWhileRevalidate: true });

/** Items per calendar day over the last `days` days, oldest first: the whole bank, or one key's scope when given. */
export async function dailyVolume(type: MediaType, days = 14, scope?: KeyScope): Promise<DailyCount[]> {
  const today = jakartaDay();
  const scopeKey = scope ? filterKey(type, new URLSearchParams(), scope) : `${type}|bank`;
  const [closed, current] = await Promise.all([
    closedDaysCache(`${scopeKey}|${days}|${today}`, () => countPerDay(type, jakartaDay(-(days - 1)), jakartaDay(-1), scope)),
    todayCache(scopeKey, () => countPerDay(type, today, today, scope)),
  ]);
  return [...closed, ...current.filter((d) => d.day === today)];
}

/** Emotion or sentiment split over a known set of items (e.g. the ones the AI has labelled). */
export async function moodsForCodes(type: MediaType, codes: string[]): Promise<MoodCount[]> {
  if (!codes.length) return [];
  const c = COLUMNS[type];
  const { rows } = await bankPool().query<MoodCount>(
    `SELECT lower(${c.mood}) value, count(*)::int n FROM ${c.from} WHERE ${c.code} = ANY($1) AND ${c.mood} IS NOT NULL AND ${c.mood} <> '' GROUP BY 1 ORDER BY 2 DESC`,
    [codes],
  );
  return rows;
}
