// Choices for the filter dropdowns. Slow to compute (~13 s for social) and barely changing: cached for an hour and served
// stale while it refreshes, and warmed first by the overview warmer, so a page rarely waits. Right after a restart, with the
// warmer's heavy counts running beside it, it took over the pool's 25 s (26 Nov 2026): it has the request limit instead.
import type { FilterOptions, MediaType } from "@/lib/media/types";
import { sharedCache } from "./cache";
import { REQUEST_TIMEOUT_MS, withLongTimeout } from "./pool";

const cache = sharedCache<FilterOptions>("bank.options", { ttlMs: 60 * 60_000, maxEntries: 4, staleWhileRevalidate: true });

const SENTIMENTS = ["positive", "neutral", "negative"];
const POST_TYPES = ["post", "reply", "quote", "repost"];

const QUERIES = {
  social: {
    sources: `SELECT DISTINCT post_source value FROM post_main
              WHERE post_timestamps > now() - interval '30 days' AND post_source IS NOT NULL ORDER BY 1`,
    moods: `SELECT lower(emotion) value, count(*) n FROM post_analyses
            WHERE created_at > now() - interval '30 days' AND emotion <> '' GROUP BY 1 ORDER BY n DESC LIMIT 20`,
    categories: `SELECT lower(category) value, count(*) n FROM post_analyses
                 WHERE created_at > now() - interval '30 days' AND category <> '' GROUP BY 1 ORDER BY n DESC LIMIT 60`,
  },
  online: {
    sources: `SELECT DISTINCT news_source value FROM news_main
              WHERE news_timestamp > now() - interval '30 days' AND news_source IS NOT NULL ORDER BY 1`,
    moods: null,
    categories: `SELECT lower(news_category_label) value, count(*) n FROM (
                   SELECT news_category_label FROM news_main ORDER BY news_timestamp DESC LIMIT 50000
                 ) t WHERE news_category_label <> '' GROUP BY 1 ORDER BY n DESC LIMIT 60`,
  },
};

const values = (rows: { value: unknown }[]) => rows.map((r) => r.value).filter((v): v is string => typeof v === "string" && !!v);

export function filterOptions(type: MediaType): Promise<FilterOptions> {
  return cache(type, async () => {
    const queries = QUERIES[type];
    // One connection with the longer limit; the four queries run one after another on it.
    const [sources, moods, categories, provinces] = await withLongTimeout(REQUEST_TIMEOUT_MS, async (pool) => [
      await pool.query<{ value: unknown }>(queries.sources),
      queries.moods ? values((await pool.query<{ value: unknown }>(queries.moods)).rows) : SENTIMENTS,
      await pool.query<{ value: unknown }>(queries.categories),
      await pool.query<{ value: string; label: string }>(`SELECT province_code value, name label FROM region_indonesia_provinces ORDER BY name`),
    ] as const);
    return {
      sources: values(sources.rows),
      moods,
      categories: values(categories.rows),
      provinces: provinces.rows.map((r) => ({ value: String(r.value), label: r.label })),
      postTypes: type === "social" ? POST_TYPES : [],
    };
  });
}
