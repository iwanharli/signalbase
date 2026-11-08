// Counts and aggregates over the source database. All results are cached because the tables hold millions of rows.
import type { KeyScope } from "@/lib/media/keyScope";
import { MOOD_SAMPLE_LIMIT } from "@/lib/media/types";
import type { DailyCount, MediaType, MoodCount } from "@/lib/media/types";
import { createCache, sharedCache } from "./cache";
import { bankPool, withLongTimeout } from "./pool";
import { buildWhere, COLUMNS, filterKey } from "./query";

/** Upper bound for the fast (capped) count and for the rows sampled by the mood breakdown. */
export const COUNT_CAP = MOOD_SAMPLE_LIMIT;

const exactCountCache = createCache<number>({ ttlMs: 10 * 60_000 });
const cappedCountCache = createCache<{ total: number; capped: boolean }>({ ttlMs: 2 * 60_000, maxEntries: 100 });
const moodCache = sharedCache<MoodCount[]>("bank.mood", { ttlMs: 2 * 60_000, maxEntries: 100, staleWhileRevalidate: true });

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

/** Matches per emotion (social) or sentiment (online), over the newest COUNT_CAP matches. */
export function moodBreakdown(type: MediaType, params: URLSearchParams, scope: KeyScope) {
  return moodCache(filterKey(type, params, scope), async () => {
    const c = COLUMNS[type];
    const { where, values } = buildWhere(type, params, scope);
    const { rows } = await bankPool().query<MoodCount>(
      `SELECT value, count(*)::int n FROM (
         SELECT lower(${c.mood}) value FROM ${c.from} WHERE ${where} ORDER BY ${c.timestamp} DESC LIMIT ${COUNT_CAP}
       ) t WHERE value IS NOT NULL AND value <> '' GROUP BY 1 ORDER BY 2 DESC`,
      values,
    );
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
    const { rows } = await bankPool().query<DailyCount>(
      `SELECT to_char(${ts}::date, 'YYYY-MM-DD') AS day, count(*)::int AS n FROM ${table}
       WHERE ${ts} >= $1::date AND ${ts} < $2::date + 1 AND ${ts} <= now() GROUP BY 1 ORDER BY 1`, [from, to]);
    return rows;
  }
  const c = COLUMNS[type];
  const { where, values } = buildWhere(type, new URLSearchParams({ from, to }), scope);
  const { rows } = await bankPool().query<DailyCount>(
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
