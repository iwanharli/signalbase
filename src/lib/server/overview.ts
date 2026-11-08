// Data behind the Ringkasan / Beranda page, per media type: 14 days of volume, the 7-day mood split, the newest items.
// Cached per scope and served stale while it refreshes; warmOverview() keeps the whole bank and every active key ready.
import { allowsType, OPEN_SCOPE, parseKeyScope, type KeyScope } from "@/lib/media/keyScope";
import type { DailyCount, MediaItem, MediaType, MoodCount } from "@/lib/media/types";
import { dailyVolume, listItems, moodBreakdown } from "./bank";
import { sharedCache } from "./bank/cache";
import { filterKey } from "./bank/query";
import { prisma } from "./db";
import { typeInsights } from "./insights";

export type TypeStats = { daily: DailyCount[]; moods: MoodCount[]; latest: MediaItem[] };

const LATEST_PER_TYPE = 4;
const WARM_EVERY_MS = 90_000;
/** Only warm-ups slower than this are logged, so the log stays quiet. */
const SLOW_WARM_MS = 20_000;

const cache = sharedCache<TypeStats>("overview", { ttlMs: 60_000, maxEntries: 100, staleWhileRevalidate: true });

/** Stats for one media type: the whole bank when `scope` is undefined, else one key's view. null when the key excludes the type. */
export function typeStats(type: MediaType, scope?: KeyScope): Promise<TypeStats> | null {
  if (scope && !allowsType(scope, type)) return null;
  const s = scope ?? OPEN_SCOPE;
  return cache(scope ? filterKey(type, new URLSearchParams(), s) : `${type}|bank`, async () => {
    const weekStart = new Date(Date.now() - 6 * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
    const [daily, moods, latest] = await Promise.all([
      dailyVolume(type, 14, scope),
      moodBreakdown(type, new URLSearchParams({ from: weekStart }), s),
      listItems(type, new URLSearchParams(), s, { limit: LATEST_PER_TYPE, offset: 0 }),
    ]);
    return { daily, moods, latest };
  });
}

/** Overview and default 7-day insights. Whole bank first, then each active key one at a time (keyword searches are heavy; this keeps the source DB calm). */
async function warmAll() {
  await Promise.all([typeStats("social"), typeStats("online")]);
  await Promise.all([typeInsights("social", 7), typeInsights("online", 7)]);
  const keys = await prisma.apiKey.findMany({ where: { revokedAt: null }, select: { scope: true, keywords: true } });
  for (const key of keys) {
    const scope = parseKeyScope(key.scope, key.keywords);
    await Promise.all([typeStats("social", scope), typeStats("online", scope)]);
    await Promise.all([typeInsights("social", 7, scope), typeInsights("online", 7, scope)]);
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
