// Data behind the Ringkasan "Analisis periode" section, per media type and period: opinion trend, this period vs the one
// before, top topics, the key's keywords, hashtags and early-warning alerts.
// One grouped scan covers both periods (rolling 24-hour windows, so "today" is never half a day); cached 5 minutes and
// served stale while it refreshes.
import type { KeyScope } from "@/lib/media/keyScope";
import { allowsType, OPEN_SCOPE } from "@/lib/media/keyScope";
import type {
  Alert, EngagementMetrics, Insights, PeriodTotals, PlatformEngagement, Ranked, TopAccount, TopMedia, TrendPoint,
} from "@/lib/media/insights";
import { moodPolarity, type Polarity } from "@/lib/media/mood";
import type { MediaType } from "@/lib/media/types";
import { listItems } from "./bank";
import { cleanName, profileLink } from "./bank/items";
import { sharedCache } from "./bank/cache";
import { analyticsPool, withLongTimeout } from "./bank/pool";
import { buildWhere, COLUMNS, filterKey, keywordQuery } from "./bank/query";

const DAY_MS = 86_400_000;
const TOP_CATEGORIES = 8;
const TOP_HASHTAGS = 10;
const HASHTAG_SAMPLE = 4000;
/** Alerts compare the last 24 hours with the average of the 7 windows before. */
const BASELINE_DAYS = 7;
const SPIKE_MIN = 10;
const SPIKE_RATIO = 2;
const NEGATIVE_MIN_LABELLED = 30;
const NEGATIVE_SHIFT = 0.08;
const MAX_ALERT_SPIKES = 3;
const INTENSE_LEVEL = 5;
const INTENSE_SHOWN = 3;

const cache = sharedCache<Insights>("insights", { ttlMs: 5 * 60_000, maxEntries: 120, staleWhileRevalidate: true });

type Row = { b: number; m: string | null; cat: string | null; hot: boolean; n: number };

const jakartaDate = (msAgo: number) => new Date(Date.now() - msAgo).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
const emptyTotals = (): PeriodTotals => ({ total: 0, labelled: 0, pos: 0, neg: 0 });

/** WHERE for the scope limited to the last `days` days, plus its bound values. */
function windowWhere(type: MediaType, scope: KeyScope, days: number) {
  const { where, values } = buildWhere(type, new URLSearchParams(), scope);
  values.push(days);
  return { where: `${where} AND ${COLUMNS[type].timestamp} >= now() - make_interval(days => $${values.length})`, values };
}

/** Counts per 24-hour window (0 = last 24 hours), mood, category and high intensity, over both periods. */
async function scan(type: MediaType, scope: KeyScope, period: number): Promise<Row[]> {
  const c = COLUMNS[type];
  const { where, values } = windowWhere(type, scope, period * 2);
  const hot = type === "social" ? `coalesce(a.emotion_level >= ${INTENSE_LEVEL}, false)` : "false";
  return withLongTimeout(90_000, async (client) => (await client.query<Row>(
    `SELECT floor(extract(epoch FROM now() - ${c.timestamp}) / 86400)::int b, lower(${c.mood}) m, lower(${c.category}) cat, ${hot} hot, count(*)::int n
     FROM ${c.from} WHERE ${where} GROUP BY 1, 2, 3, 4`, values)).rows);
}

/** Per keyword of the key: matches this period, the period before, and negative matches this period. */
async function keywordCounts(type: MediaType, scope: KeyScope, period: number): Promise<Ranked[] | null> {
  const keywords = scope.keywords.filter((k) => keywordQuery([k]));
  if (keywords.length < 2) return null; // one keyword is just the total
  const c = COLUMNS[type];
  const { where, values } = windowWhere(type, scope, period * 2);
  const columns = keywords.map((k, i) => {
    values.push(keywordQuery([k]));
    return `count(*) FILTER (WHERE ${c.search} @@ to_tsquery('indonesian', $${values.length}))::int k${i}`;
  });
  values.push(period);
  const { rows } = await withLongTimeout(90_000, (client) => client.query<Record<string, number | string | boolean | null>>(
    `SELECT lower(${c.mood}) m, ${c.timestamp} >= now() - make_interval(days => $${values.length}) cur, ${columns.join(", ")}
     FROM ${c.from} WHERE ${where} GROUP BY 1, 2`, values));
  return keywords.map((value, i) => {
    const out: Ranked = { value, n: 0, prev: 0, neg: 0 };
    for (const row of rows) {
      const n = Number(row[`k${i}`]);
      if (row.cur) { out.n += n; if (typeof row.m === "string" && moodPolarity(row.m) === "neg") out.neg! += n; } else out.prev += n;
    }
    return out;
  }).sort((a, b) => b.n - a.n);
}

/** Most used hashtags in the newest posts of this period, with their count in the period before (social only). */
async function hashtags(scope: KeyScope, period: number): Promise<Ranked[]> {
  const c = COLUMNS.social;
  const { where, values } = windowWhere("social", scope, period * 2);
  values.push(period);
  const split = `${c.timestamp} >= now() - make_interval(days => $${values.length})`;
  const { rows } = await analyticsPool().query<{ cur: boolean; tag: string; n: number }>(
    `SELECT s.cur, lower(r.m[1]) tag, count(*)::int n FROM (
       (SELECT true cur, p.post_content FROM ${c.from} WHERE ${where} AND ${split} ORDER BY ${c.timestamp} DESC LIMIT ${HASHTAG_SAMPLE})
       UNION ALL
       (SELECT false cur, p.post_content FROM ${c.from} WHERE ${where} AND NOT (${split}) ORDER BY ${c.timestamp} DESC LIMIT ${HASHTAG_SAMPLE})
     ) s CROSS JOIN LATERAL regexp_matches(s.post_content, '#([[:alnum:]_]{2,40})', 'g') r(m)
     GROUP BY 1, 2`, values);
  const byTag = new Map<string, Ranked>();
  for (const row of rows) {
    const entry = byTag.get(row.tag) ?? { value: row.tag, n: 0, prev: 0 };
    if (row.cur) entry.n += row.n; else entry.prev += row.n;
    byTag.set(row.tag, entry);
  }
  return [...byTag.values()].filter((t) => t.n > 1).sort((a, b) => b.n - a.n).slice(0, TOP_HASHTAGS);
}

// Same field names as the item mapper (bank/items.ts): Twitter comment/retweet, Threads reply/repost, Facebook komentar.
const METRIC_FIELDS = {
  likes: ["like"],
  comments: ["comment", "reply", "komentar"],
  shares: ["retweet", "repost", "share"],
  views: ["view"],
} as const;
type Metric = keyof typeof METRIC_FIELDS;
const FACEBOOK_MAX = 50_000;

/** Likes, comments, shares and views per platform over both periods. Counts are as captured when the post was scraped. */
async function engagement(scope: KeyScope, period: number): Promise<PlatformEngagement[]> {
  const c = COLUMNS.social;
  const { where, values } = windowWhere("social", scope, period * 2);
  values.push(period);
  const cur = `${c.timestamp} >= now() - make_interval(days => $${values.length})`;
  const cols = (Object.keys(METRIC_FIELDS) as Metric[]).flatMap((name) => {
    // The first of the platform's field names the post has; only plain whole numbers count. Implausible values are
    // scraper errors and are skipped: 10 million or more on any post, and 50,000 or more on Facebook, where small local
    // pages and ads read e.g. 20,000,000 likes or 399,900 comments with 0 likes (its 99th percentile is under 200).
    const v = `coalesce(${METRIC_FIELDS[name].map((f) => `p.additional_data->>'${f}'`).join(", ")})`;
    // Views legitimately pass 10 million on big videos, so they only need to be a sane number (under 10 billion).
    const digits = name === "views" ? 10 : 7;
    const num = `CASE WHEN ${v} ~ '^[0-9]{1,${digits}}$' AND (${c.source} <> 'facebook' OR (${v})::bigint < ${FACEBOOK_MAX}) THEN (${v})::bigint END`;
    return [
      `sum(${num}) FILTER (WHERE ${cur})::float8 ${name}_cur`,
      `sum(${num}) FILTER (WHERE NOT (${cur}))::float8 ${name}_prev`,
      `count(${num})::int ${name}_n`,
    ];
  });
  const { rows } = await withLongTimeout(90_000, (client) => client.query<Record<string, string | number | null>>(
    `SELECT ${c.source} src, count(*) FILTER (WHERE ${cur})::int posts, ${cols.join(", ")} FROM ${c.from} WHERE ${where} GROUP BY 1`, values));
  const pick = (row: Record<string, string | number | null>, which: "cur" | "prev"): EngagementMetrics => {
    const out = { likes: null, comments: null, shares: null, views: null } as EngagementMetrics;
    for (const name of Object.keys(METRIC_FIELDS) as Metric[]) out[name] = Number(row[`${name}_n`]) ? Number(row[`${name}_${which}`] ?? 0) : null;
    return out;
  };
  return rows
    .filter((r) => r.src && Number(r.posts) > 0)
    .map((r) => ({ source: String(r.src), posts: Number(r.posts), current: pick(r, "cur"), previous: pick(r, "prev") }))
    .sort((a, b) => b.posts - a.posts);
}

const TOP_SOURCES = 10;

/** Labelled and negative counts from per-mood rows. */
function moodCounts(rows: { m: string | null; n: number }[]) {
  let labelled = 0, neg = 0;
  for (const r of rows) {
    if (!r.m) continue;
    labelled += r.n;
    if (moodPolarity(r.m) === "neg") neg += r.n;
  }
  return { labelled, neg };
}

/** The accounts with the most posts this period (top 10 overall plus top 10 of each platform), with their previous count, opinion and likes. */
async function topAccounts(scope: KeyScope, period: number): Promise<TopAccount[]> {
  const c = COLUMNS.social;
  const { where, values } = windowWhere("social", scope, period * 2);
  values.push(period);
  const cur = `${c.timestamp} >= now() - make_interval(days => $${values.length})`;
  const like = `CASE WHEN p.additional_data->>'like' ~ '^[0-9]{1,7}$' AND (${c.source} <> 'facebook' OR (p.additional_data->>'like')::bigint < ${FACEBOOK_MAX}) THEN (p.additional_data->>'like')::bigint END`;
  return withLongTimeout(90_000, async (client) => {
    // The top accounts overall and the top accounts of each platform (for the platform tabs), in one scan.
    const top = (await client.query<{ src: string; u: string; name: string | null; n: number; prev: number; likes: number | null }>(
      `WITH accounts AS (
         SELECT ${c.source} src, p.post_username u, max(p.post_author) name, count(*) FILTER (WHERE ${cur})::int n,
           count(*) FILTER (WHERE NOT (${cur}))::int prev, sum(${like}) FILTER (WHERE ${cur})::float8 likes
         FROM ${c.from} WHERE ${where} AND p.post_username IS NOT NULL AND p.post_username <> ''
         GROUP BY 1, 2 HAVING count(*) FILTER (WHERE ${cur}) > 0
       ), ranked AS (
         SELECT *, row_number() OVER (ORDER BY n DESC) overall, row_number() OVER (PARTITION BY src ORDER BY n DESC) in_platform FROM accounts
       )
       SELECT src, u, name, n, prev, likes FROM ranked WHERE overall <= ${TOP_SOURCES} OR in_platform <= ${TOP_SOURCES} ORDER BY n DESC`, values)).rows;
    if (!top.length) return [];
    // Opinion of just these accounts, this period.
    const moods = (await client.query<{ src: string; u: string; m: string | null; n: number }>(
      `SELECT ${c.source} src, p.post_username u, lower(${c.mood}) m, count(*)::int n FROM ${c.from}
       WHERE ${where} AND ${cur} AND (${c.source}, p.post_username) IN (SELECT * FROM unnest($${values.length + 1}::text[], $${values.length + 2}::text[]))
       GROUP BY 1, 2, 3`, [...values, top.map((t) => t.src), top.map((t) => t.u)])).rows;
    return top.map((t) => ({
      source: t.src, username: t.u, name: cleanName(t.name), profileUrl: profileLink(t.src, t.u),
      n: t.n, prev: t.prev, likes: Number(t.likes ?? 0),
      ...moodCounts(moods.filter((m) => m.src === t.src && m.u === t.u)),
    }));
  });
}

/** The news outlets with the most articles this period, with their previous count and sentiment. */
async function topMedia(scope: KeyScope, period: number): Promise<TopMedia[]> {
  const c = COLUMNS.online;
  const { where, values } = windowWhere("online", scope, period * 2);
  values.push(period);
  const cur = `${c.timestamp} >= now() - make_interval(days => $${values.length})`;
  const { rows } = await withLongTimeout(90_000, (client) => client.query<{ src: string; m: string | null; cur: boolean; n: number }>(
    `SELECT ${c.source} src, lower(${c.mood}) m, ${cur} cur, count(*)::int n FROM ${c.from}
     WHERE ${where} AND ${c.source} IS NOT NULL GROUP BY 1, 2, 3`, values));
  const bySource = new Map<string, { n: number; prev: number; moods: { m: string | null; n: number }[] }>();
  for (const r of rows) {
    const e = bySource.get(r.src) ?? { n: 0, prev: 0, moods: [] };
    if (r.cur) { e.n += r.n; e.moods.push({ m: r.m, n: r.n }); } else e.prev += r.n;
    bySource.set(r.src, e);
  }
  return [...bySource]
    .filter(([, e]) => e.n > 0)
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, TOP_SOURCES)
    .map(([source, e]) => ({ source, n: e.n, prev: e.prev, ...moodCounts(e.moods) }));
}

function summarize(rows: Row[], period: number) {
  const polarity = new Map<string, Polarity>();
  const polarityOf = (m: string) => { if (!polarity.has(m)) polarity.set(m, moodPolarity(m)); return polarity.get(m)!; };

  const trend: TrendPoint[] = Array.from({ length: period }, (_, i) => {
    const b = period - 1 - i;
    return { day: jakartaDate(b * DAY_MS), total: 0, pos: 0, neu: 0, neg: 0 };
  });
  const current = emptyTotals(), previous = emptyTotals();
  const categories = new Map<string, Ranked>();
  /** Per window b (0..BASELINE_DAYS): total, labelled, negative, intense-negative, and per category. */
  const recent = Array.from({ length: BASELINE_DAYS + 1 }, () => ({ total: 0, labelled: 0, neg: 0, hot: 0, cats: new Map<string, number>() }));

  for (const row of rows) {
    if (row.b < 0 || row.b >= period * 2) continue;
    const cur = row.b < period;
    const side = row.m ? polarityOf(row.m) : null;
    const totals = cur ? current : previous;
    totals.total += row.n;
    if (side) { totals.labelled += row.n; if (side === "pos") totals.pos += row.n; if (side === "neg") totals.neg += row.n; }
    if (cur) {
      const point = trend[period - 1 - row.b];
      point.total += row.n;
      if (side) point[side] += row.n;
    }
    if (row.cat) {
      const entry = categories.get(row.cat) ?? { value: row.cat, n: 0, prev: 0 };
      if (cur) entry.n += row.n; else entry.prev += row.n;
      categories.set(row.cat, entry);
    }
    if (row.b <= BASELINE_DAYS) {
      const w = recent[row.b];
      w.total += row.n;
      if (side) { w.labelled += row.n; if (side === "neg") { w.neg += row.n; if (row.hot) w.hot += row.n; } }
      if (row.cat) w.cats.set(row.cat, (w.cats.get(row.cat) ?? 0) + row.n);
    }
  }
  return { trend, current, previous, categories: [...categories.values()].sort((a, b) => b.n - a.n), recent };
}

/** Values (categories or keywords) whose last 24 hours are well above their daily average over the week before. */
function spikes(now: Map<string, number>, baseline: (value: string) => number, source: "category" | "keyword", label = (v: string) => v): Alert[] {
  return [...now].flatMap(([value, n]) => {
    const avg = baseline(value);
    return n >= SPIKE_MIN && n >= Math.max(1, avg) * SPIKE_RATIO ? [{ kind: "spike" as const, label: label(value), source, n, avg }] : [];
  });
}

async function compute(type: MediaType, scope: KeyScope, scoped: boolean, period: number): Promise<Insights> {
  const [rows, keywords, tags, latestHot, engaged, accounts, media] = await Promise.all([
    scan(type, scope, period),
    scoped ? keywordCounts(type, scope, period) : Promise.resolve(null),
    type === "social" ? hashtags(scope, period) : Promise.resolve(null),
    type === "social"
      ? listItems(type, new URLSearchParams({ level: String(INTENSE_LEVEL), from: jakartaDate(DAY_MS) }), scope, { limit: 12, offset: 0 })
      : Promise.resolve([]),
    type === "social" ? engagement(scope, period) : Promise.resolve(null),
    type === "social" ? topAccounts(scope, period) : Promise.resolve(null),
    type === "online" ? topMedia(scope, period) : Promise.resolve(null),
  ]);
  const { trend, current, previous, categories, recent } = summarize(rows, period);
  const [today, ...week] = recent;

  const alerts: Alert[] = [];
  const weekAvg = (pick: (w: (typeof recent)[number]) => number) => week.reduce((t, w) => t + pick(w), 0) / BASELINE_DAYS;
  alerts.push(...spikes(today.cats, (cat) => weekAvg((w) => w.cats.get(cat) ?? 0), "category"));
  // Keyword spikes from the trend of each keyword would need a per-window scan; the 24-hour count vs the period's daily
  // average is a fair, cheap approximation.
  if (keywords) {
    const recentKw = await keywordCounts(type, scope, 1).catch(() => null);
    if (recentKw) {
      const perDay = new Map(keywords.map((k) => [k.value, (k.n + k.prev) / (period * 2)]));
      alerts.push(...spikes(new Map(recentKw.map((k) => [k.value, k.n])), (v) => perDay.get(v) ?? 0, "keyword"));
    }
  }
  alerts.sort((a, b) => (a.kind === "spike" && b.kind === "spike" ? b.n / Math.max(1, b.avg) - a.n / Math.max(1, a.avg) : 0));
  alerts.splice(MAX_ALERT_SPIKES);

  const avgLabelled = weekAvg((w) => w.labelled);
  const avgShare = avgLabelled ? weekAvg((w) => w.neg) / avgLabelled : 0;
  const share = today.labelled ? today.neg / today.labelled : 0;
  if (today.labelled >= NEGATIVE_MIN_LABELLED && share - avgShare >= NEGATIVE_SHIFT) alerts.unshift({ kind: "negative", share, avgShare, n: today.neg });
  if (today.hot > 0) alerts.unshift({ kind: "intense", n: today.hot });

  const pulse = {
    now: { total: today.total, labelled: today.labelled, neg: today.neg, hot: today.hot },
    avg: { total: weekAvg((w) => w.total), labelled: avgLabelled, neg: weekAvg((w) => w.neg), hot: weekAvg((w) => w.hot) },
  };

  return {
    period, trend, current, previous, pulse, engagement: engaged, accounts, media,
    categories: categories.slice(0, TOP_CATEGORIES),
    keywords, hashtags: tags, alerts,
    intense: latestHot.filter((item) => item.mood && moodPolarity(item.mood) === "neg").slice(0, INTENSE_SHOWN),
    at: new Date().toISOString(),
  };
}

/** Insights for one media type: the whole bank when `scope` is undefined, else one key's view. null when the key excludes the type. */
export function typeInsights(type: MediaType, period: number, scope?: KeyScope): Promise<Insights> | null {
  if (scope && !allowsType(scope, type)) return null;
  const s = scope ?? OPEN_SCOPE;
  return cache(`${scope ? filterKey(type, new URLSearchParams(), s) : `${type}|bank`}|${period}`, () => compute(type, s, !!scope, period));
}
