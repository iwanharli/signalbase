import { createHash } from "node:crypto";
// Builds the SQL filter for source-database queries from request parameters.
// Every user-supplied value is passed as a bound parameter.
import type { KeyScope } from "@/lib/media/keyScope";
import { keywordToQuery } from "@/lib/media/keywordExpr";
import { codesBetween } from "@/lib/media/matchSet";
import type { MediaType } from "@/lib/media/types";
import { escapeLike, parseSearch } from "@/lib/media/searchQuery";

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
const FILTER_PARAMS = ["q", "from", "to", "since", "source", "mood", "lang", "analyzed", "province", "category", "postType", "level", "image", "relevance"];

const isDate = (value: string | null): value is string => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);

/**
 * A key's keywords as a Postgres full-text query: any keyword matches. A keyword is a word, a phrase (words in order), or
 * an AND / OR expression (lib/media/keywordExpr.ts). "polisi tidur" never counts as "polisi". No keywords = no restriction;
 * a keyword that cannot be read (only possible for rows saved before validation) is left out.
 *
 * Every query against post_content_tsv / news_title_tsv must use the 'indonesian' config: the source database's triggers
 * build those columns with pg_catalog.indonesian, which stores word stems ("kecelakaan" → celaka, "ditangkap" → tangkap).
 * Querying with 'simple' would look for the unstemmed word and never match any keyword with an affix.
 */
export function keywordQuery(keywords: string[]) {
  return keywords
    .flatMap((keyword) => {
      const r = keywordToQuery(keyword);
      return "query" in r && r.query ? [r.query] : [];
    })
    .join(" | ");
}

/** Who wrote an item, for "@name" in the search box: the handle exactly (any case) or a name containing it. No index on
 *  these columns, so it narrows what the other conditions (scope keywords, dates) already found. */
const AUTHOR = {
  social: (bind: (v: unknown) => string, name: string) => `(p.post_username ILIKE ${bind(escapeLike(name))} OR p.post_author ILIKE ${bind(`%${escapeLike(name)}%`)})`,
  online: (bind: (v: unknown) => string, name: string) => `n.news_author ILIKE ${bind(`%${escapeLike(name)}%`)}`,
} as const;

/**
 * A scope for cache keys. The project's image codes are left out on purpose: they grow every few minutes as the media
 * worker reads new images, and putting them in the key made every cached count, insight and page of that project miss
 * (SLOG POLRI insights 0,6 → 13 s after the first deploy). A cached result simply includes the codes as of its refresh,
 * like any other new post. The image codes of a search (imageSearch) belong to that search, so they stay (as a digest).
 */
export function scopeKey(scope: KeyScope) {
  // matched (stored keyword matches) is left out for the same reason: it grows every minute.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { imageCodes: _codes, imageSearch, matched: _matched, ...rest } = scope;
  const digest = (c: KeyScope["imageSearch"]) => createHash("sha1").update(JSON.stringify([c?.social ?? [], c?.online ?? []])).digest("hex").slice(0, 12);
  return JSON.stringify({ ...rest, img: !!_codes }) + (imageSearch ? `#imgq:${digest(imageSearch)}` : "");
}

/** Stable cache key for a filter set. */
export const filterKey = (type: MediaType, params: URLSearchParams, scope: KeyScope) =>
  [type, scopeKey(scope), ...FILTER_PARAMS.map((k) => params.get(k) ?? "")].join("|");

/** Conditions from the API key's fixed scope. Added on top of the request filters, so they can only narrow. */
function scopeConditions(type: MediaType, scope: KeyScope, bind: (value: unknown) => string, range: { from: string | null; to: string | null }) {
  const c = COLUMNS[type];
  const social = type === "social";
  const where: string[] = [];
  const keywordTs = keywordQuery(scope.keywords);
  const imageCodes = scope.imageCodes?.[type];
  const matched = scope.matched?.[type];
  if (keywordTs) {
    // A long keyword list whose matches are stored (server/projectMatches.ts): only the stored codes of the requested
    // dates. Anything older than the matches reach (BACKFILL_DAYS) is left out: searching it is what took minutes.
    const byKeyword = matched
      ? `${c.code} = ANY(${bind(codesBetween(matched, range.from, range.to))}::text[])`
      : `${c.search} @@ to_tsquery('indonesian', ${bind(keywordTs)})`;
    // Items whose image text names a keyword (media worker) count too, even when their caption doesn't.
    where.push(imageCodes?.length ? `(${byKeyword} OR ${c.code} = ANY(${bind(imageCodes)}::text[]))` : byKeyword);
  }
  // A second keyword set on top (an SNA watch within a project): items must match one of these as well.
  const alsoTs = scope.alsoKeywords?.length ? keywordQuery(scope.alsoKeywords) : "";
  if (alsoTs) where.push(`${c.search} @@ to_tsquery('indonesian', ${bind(alsoTs)})`);
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

  // The request's date range (from/to, or an exact `since`), for the stored matches of a long keyword list.
  const since = get("since");
  const sinceOk = !!since && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(since);
  const fromDay = isDate(get("from")) ? get("from") : null;
  const lower = sinceOk && (!fromDay || since.replace(" ", "T") > fromDay) ? since.replace(" ", "T") : fromDay;
  where.push(...scopeConditions(type, scope, bind, { from: lower, to: isDate(get("to")) ? get("to") : null }));

  // The search box (lib/media/searchQuery.ts): parts are alternatives; words, "phrases" and @accounts in a part all match.
  const search = get("q")?.trim();
  const parts = search ? parseSearch(search) : [];
  if (parts.length) {
    // One tsquery per part (words && phrases); parts without an account share a single @@, which the GIN index serves.
    const tsquery = (part: (typeof parts)[number]) => [
      ...(part.words ? [`plainto_tsquery('indonesian', ${bind(part.words)})`] : []),
      ...part.phrases.map((phrase) => `phraseto_tsquery('indonesian', ${bind(phrase)})`),
    ].join(" && ");
    const plain = parts.filter((p) => !p.accounts.length).map(tsquery);
    const byAuthor = parts.filter((p) => p.accounts.length).map((part) => {
      const q = tsquery(part);
      return [...(q ? [`${c.search} @@ (${q})`] : []), ...part.accounts.map((name) => AUTHOR[type](bind, name))].join(" AND ");
    });
    const alternatives = [...(plain.length ? [`${c.search} @@ (${plain.join(" || ")})`] : []), ...byAuthor.map((cond) => `(${cond})`)];
    const text = alternatives.length === 1 ? alternatives[0] : `(${alternatives.join(" OR ")})`;
    // Items whose image text matches the search (found by the media route in the Signalbase database) count too.
    const byImage = scope.imageSearch?.[type];
    where.push(byImage?.length ? `(${text} OR ${c.code} = ANY(${bind(byImage)}::text[]))` : text);
  }

  const from = get("from"), to = get("to");
  if (isDate(from)) where.push(`${c.timestamp} >= ${bind(from)}::date`);
  if (isDate(to)) where.push(`${c.timestamp} < ${bind(to)}::date + 1`);
  // since: an exact wall-clock time "YYYY-MM-DD HH:mm:ss" (internal; the AI worker's start point).
  if (sinceOk) where.push(`${c.timestamp} >= ${bind(since)}::timestamp`);

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
