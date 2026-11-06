// Builds the SQL filter for source-database queries from request parameters.
// Every user-supplied value is passed as a bound parameter.
import type { KeyScope } from "@/lib/media/keyScope";
import type { MediaType } from "@/lib/media/types";

/** Table aliases and columns per media type. Social: post_main p + post_analyses a; news: news_main n + news_analyses a. */
export const COLUMNS = {
  social: {
    from: "post_main p LEFT JOIN post_analyses a ON a.post_id = p.id",
    code: "p.post_code", timestamp: "p.post_timestamps", search: "p.post_content_tsv", source: "p.post_source",
    language: "p.post_language", mood: "a.emotion", category: "a.category",
  },
  online: {
    from: "news_main n LEFT JOIN news_analyses a ON a.news_code = n.news_code",
    code: "n.news_code", timestamp: "n.news_timestamp", search: "n.news_title_tsv", source: "n.news_source",
    language: "n.news_language", mood: "a.sentiment", category: "n.news_category_label",
  },
} as const;

// Every parameter that changes the result set; used to build cache keys.
const FILTER_PARAMS = ["q", "from", "to", "source", "mood", "lang", "analyzed", "province", "category", "postType", "level", "image", "relevance"];

const isDate = (value: string | null): value is string => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);

/**
 * A key's keywords as a Postgres full-text query (any keyword matches; multi-word keywords match as a phrase).
 * "polisi tidur" is a speed bump, not the police, so it never counts as "polisi". No keywords = no restriction.
 */
export function keywordQuery(keywords: string[]) {
  return keywords
    .flatMap((keyword) => {
      const words = keyword.toLowerCase().match(/[a-z0-9]+/g);
      if (!words) return [];
      const phrase = words.join(" <-> ");
      return [phrase === "polisi" ? "(polisi & !(polisi <-> tidur))" : `(${phrase})`];
    })
    .join(" | ");
}

/** Stable cache key for a filter set. */
export const filterKey = (type: MediaType, params: URLSearchParams, scope: KeyScope) =>
  [type, JSON.stringify(scope), ...FILTER_PARAMS.map((k) => params.get(k) ?? "")].join("|");

/** Conditions from the API key's fixed scope. Added on top of the request filters, so they can only narrow. */
function scopeConditions(type: MediaType, scope: KeyScope, bind: (value: unknown) => string) {
  const c = COLUMNS[type];
  const social = type === "social";
  const where: string[] = [];
  const keywordTs = keywordQuery(scope.keywords);
  if (keywordTs) where.push(`${c.search} @@ to_tsquery('simple', ${bind(keywordTs)})`);
  if (scope.analyzedOnly) where.push(`${c.mood} IS NOT NULL AND ${c.mood} <> ''`);
  if (scope.language === "id") where.push(`${c.language} = 'id'`);
  else if (scope.language === "other") where.push(`${c.language} IS DISTINCT FROM 'id'`);
  if (scope.provinces.length) where.push(social ? `a.province_id = ANY(${bind(scope.provinces)}::bigint[])` : `n.region_code = ANY(${bind(scope.provinces)}::text[])`);
  if (scope.categories.length) where.push(`lower(${c.category}) = ANY(${bind(scope.categories)}::text[])`);
  if (social) {
    if (scope.relevance === "relevant") where.push(`a.status_filter IS DISTINCT FROM 'exclude'`);
    else if (scope.relevance) where.push(`a.status_filter = ${bind(scope.relevance)}`);
    if (scope.minLevel) where.push(`a.emotion_level >= ${bind(scope.minLevel)}::int`);
  }
  return where;
}

/** WHERE clause and bound values for the request filters within an API key's scope. */
export function buildWhere(type: MediaType, params: URLSearchParams, scope: KeyScope) {
  const c = COLUMNS[type];
  const social = type === "social";
  const values: unknown[] = [];
  const bind = (value: unknown) => `$${values.push(value)}`;
  const where: string[] = [];
  const get = (key: string) => params.get(key);

  // Timestamps outside this window are scraper errors (some rows say 1925).
  where.push(`${c.timestamp} >= '2010-01-01'`, `${c.timestamp} <= now()`);

  where.push(...scopeConditions(type, scope, bind));

  const search = get("q")?.trim();
  if (search) where.push(`${c.search} @@ plainto_tsquery('simple', ${bind(search.slice(0, 200))})`);

  const from = get("from"), to = get("to");
  if (isDate(from)) where.push(`${c.timestamp} >= ${bind(from)}::date`);
  if (isDate(to)) where.push(`${c.timestamp} < ${bind(to)}::date + 1`);

  // analyzed: "yes" = has an emotion/sentiment label, "no" = not labelled yet.
  const analyzed = get("analyzed");
  if (analyzed === "yes") where.push(`${c.mood} IS NOT NULL AND ${c.mood} <> ''`);
  else if (analyzed === "no") where.push(`(${c.mood} IS NULL OR ${c.mood} = '')`);

  // lang: "id" = Indonesian only, "other" = anything else (social stores non_id, news en/ms).
  const language = get("lang");
  if (language === "id") where.push(`${c.language} = 'id'`);
  else if (language === "other") where.push(`${c.language} IS DISTINCT FROM 'id'`);

  const source = get("source");
  if (source) where.push(`${c.source} = ${bind(source)}`);

  const mood = get("mood");
  if (mood) where.push(`lower(${c.mood}) = lower(${bind(mood.slice(0, 40))})`);

  const province = get("province");
  if (province && /^\d{1,4}$/.test(province)) where.push(social ? `a.province_id = ${bind(province)}::bigint` : `n.region_code = ${bind(province)}`);

  const category = get("category");
  if (category) where.push(`lower(${c.category}) = lower(${bind(category.slice(0, 60))})`);

  if (social) {
    where.push(`p.post_type IS DISTINCT FROM 'spam'`);

    // relevance: "relevant" hides posts the AI excluded; otherwise one exact status.
    const relevance = get("relevance");
    if (relevance === "relevant") where.push(`a.status_filter IS DISTINCT FROM 'exclude'`);
    else if (relevance === "include" || relevance === "watchlist" || relevance === "exclude") where.push(`a.status_filter = ${bind(relevance)}`);

    const postType = get("postType");
    if (postType) where.push(`p.post_type = ${bind(postType.slice(0, 20))}`);

    const minLevel = Number(get("level"));
    if (minLevel >= 1 && minLevel <= 5) where.push(`a.emotion_level >= ${bind(Math.floor(minLevel))}::int`);
  } else if (get("image") === "yes") {
    where.push(`n.news_image ~ '^https?://'`);
  }

  return { where: where.join(" AND "), values };
}
