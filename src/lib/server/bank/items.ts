// Reading posts and articles from the source database.
import { decodeTextEntities } from "@/lib/media/text";
import type { KeyScope } from "@/lib/media/keyScope";
import type { Analysis, Author, MediaItem, MediaType, Relevance } from "@/lib/media/types";
import { bankPool } from "./pool";
import { buildWhere, COLUMNS } from "./query";
import { cleanSummary } from "./summary";

const RELEVANCE: Relevance[] = ["include", "watchlist", "exclude"];

const safeUrl = (url: string | null) => (url && /^https?:\/\//i.test(url) ? url : null);
const toNumber = (v: unknown) => (v === undefined || v === null || v === "" ? null : Number(v) || 0);
const toStrings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x).map((x) => decodeTextEntities(x)) : []);

// Both selects return the same column names so one mapper handles either type.
// Author columns are read but dropped by toItem unless the caller may see authors.
const SELECT = {
  social: `
    p.post_code code, p.post_source source, NULL title, p.post_content content, NULL url, NULL image, p.post_timestamps ts,
    p.post_type "postType", p.additional_data extra, a.category, a.location, lower(a.emotion) mood, a.emotion_level "moodLevel", pr.name province,
    a.id analysis_id, a.summaries summary, a.emotion_target target, a.emotion_score score, a.signal signals, a.factors,
    a.status_filter relevance, NULL topics,
    p.post_author author, p.post_username username, p.post_url post_url, p.post_account_type account_type,
    p.post_language language, NULL city, NULL body
    FROM ${COLUMNS.social.from} LEFT JOIN region_indonesia_provinces pr ON pr.province_code = a.province_id::text
    WHERE p.post_code = ANY($1)`,
  online: `
    n.news_code code, n.news_source source, n.news_title title, n.news_preview content, n.news_url url, n.news_image image, n.news_timestamp ts,
    NULL "postType", NULL extra, n.news_category_label category, NULL location, lower(a.sentiment) mood, NULL "moodLevel", pr.name province,
    a.id analysis_id, NULL summary, NULL target, NULL score, NULL signals, NULL factors, NULL relevance, a.topics,
    n.news_author author, NULL username, NULL post_url, NULL account_type,
    n.news_language language, ci.name city, n.news_content body
    FROM ${COLUMNS.online.from} LEFT JOIN region_indonesia_provinces pr ON pr.province_code = n.region_code
    LEFT JOIN region_indonesia_cities ci ON ci.city_code = n.city_code
    WHERE n.news_code = ANY($1)`,
};

/* eslint-disable @typescript-eslint/no-explicit-any -- raw pg rows */
function toAnalysis(row: any): Analysis | null {
  if (row.analysis_id == null) return null;
  return {
    summary: cleanSummary(decodeTextEntities(row.summary)),
    target: decodeTextEntities(row.target) || null,
    score: row.score == null ? null : Number(row.score),
    signals: toStrings(row.signals),
    topics: toStrings(row.topics?.items),
    factors: row.factors && typeof row.factors === "object" && !Array.isArray(row.factors) ? row.factors : null,
    relevance: RELEVANCE.includes(row.relevance) ? row.relevance : null,
  };
}

// Profile links built from the username; Facebook stores its own, YouTube usernames don't map to a channel URL.
const PROFILE: Record<string, (u: string) => string> = {
  twitter: (u) => `https://x.com/${u}`,
  threads: (u) => `https://www.threads.com/@${u}`,
  instagram: (u) => `https://www.instagram.com/${u}`,
  tiktok: (u) => `https://www.tiktok.com/@${u}`,
};

// Names come as "Display ( handle )" on some sources and percent-encoded on others.
function cleanName(raw: string | null) {
  if (!raw) return null;
  let s = raw.replace(/\s*\([^()]*\)\s*$/, "").trim();
  try { s = decodeURIComponent(s); } catch { /* not encoded */ }
  return decodeTextEntities(s) || null;
}

function toAuthor(row: any, extra: any): Author | null {
  if (!row.author && !row.username) return null;
  const username = row.username || null;
  const profile = PROFILE[row.source] as ((u: string) => string) | undefined;
  return {
    name: cleanName(row.author) ?? cleanName(extra.nama ?? null),
    username,
    profileUrl: safeUrl(extra.profile_url ?? null) ?? (username && profile && /^[\w.]{1,60}$/.test(username) ? profile(username) : null),
    accountType: row.account_type ?? null,
    followers: toNumber(extra.follower),
    following: toNumber(extra.following),
  };
}

function toItem(row: any, authors = false): MediaItem {
  const extra = row.extra ?? {};
  return {
    code: row.code,
    source: row.source,
    title: decodeTextEntities(row.title),
    content: decodeTextEntities(row.content),
    url: safeUrl(row.url) ?? (authors ? safeUrl(row.post_url) : null),
    image: safeUrl(row.image),
    postType: row.postType,
    category: row.category,
    province: row.province,
    location: row.location,
    publishedAt: new Date(row.ts).toISOString(),
    mood: row.mood,
    moodLevel: row.moodLevel,
    // Twitter stores comment/retweet, Threads reply/repost, others share.
    metrics: {
      likes: toNumber(extra.like),
      comments: toNumber(extra.comment ?? extra.reply),
      shares: toNumber(extra.retweet ?? extra.repost ?? extra.share),
      views: toNumber(extra.view),
    },
    analysis: toAnalysis(row),
    language: row.language ?? null,
    city: row.city ?? null,
    body: decodeTextEntities(row.body) || null,
    ...(authors ? { author: toAuthor(row, extra) } : {}),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Full items for the given codes, in the order given; `authors` adds who posted and the post link. */
export async function fetchItemsByCode(type: MediaType, codes: string[], { authors = false } = {}): Promise<MediaItem[]> {
  if (!codes.length) return [];
  const { rows } = await bankPool().query(`SELECT ${SELECT[type]}`, [codes]);
  const byCode = new Map(rows.map((row) => [row.code, row]));
  return codes.flatMap((code) => (byCode.has(code) ? [toItem(byCode.get(code), authors)] : []));
}

/** `limit` matching items starting at `offset`, newest first unless sort=oldest. */
export async function listItems(type: MediaType, params: URLSearchParams, scope: KeyScope, { limit, offset, authors = false }: { limit: number; offset: number; authors?: boolean }) {
  const c = COLUMNS[type];
  const { where, values } = buildWhere(type, params, scope);
  const direction = params.get("sort") === "oldest" ? "ASC" : "DESC";
  const { rows } = await bankPool().query<{ code: string }>(
    `SELECT ${c.code} code FROM ${c.from} WHERE ${where} ORDER BY ${c.timestamp} ${direction} LIMIT ${Math.floor(limit)} OFFSET ${Math.floor(offset)}`,
    values,
  );
  return fetchItemsByCode(type, rows.map((r) => r.code), { authors });
}

/**
 * Of the given item codes (e.g. one AI category), those that also match the request filters and the key's
 * scope, in timeline order. Lets AI category filters combine with search, source, mood, province, and so on.
 */
export async function filterCodes(type: MediaType, params: URLSearchParams, scope: KeyScope, codes: string[]): Promise<string[]> {
  if (!codes.length) return [];
  const c = COLUMNS[type];
  const { where, values } = buildWhere(type, params, scope);
  const direction = params.get("sort") === "oldest" ? "ASC" : "DESC";
  const codesParam = `$${values.length + 1}`;
  const { rows } = await bankPool().query<{ code: string }>(
    `SELECT ${c.code} code FROM ${c.from} WHERE ${where} AND ${c.code} = ANY(${codesParam}) ORDER BY ${c.timestamp} ${direction}`,
    [...values, codes],
  );
  return rows.map((r) => r.code);
}

export type TimeCursor = { ts: string; code: string };

/**
 * Items within a scope, walking the timeline from a cursor (ts, code) — used by the background
 * classifier. "older" walks back from the cursor (newest first), "newer" walks forward (oldest first).
 * The tuple comparison keeps items sharing a timestamp from being skipped at batch boundaries.
 */
export async function listItemsFromCursor(type: MediaType, scope: KeyScope, direction: "older" | "newer", cursor: TimeCursor | null, limit: number) {
  const c = COLUMNS[type];
  const { where, values } = buildWhere(type, new URLSearchParams(), scope);
  const conditions = [where];
  if (cursor) {
    values.push(cursor.ts, cursor.code);
    const ts = `$${values.length - 1}::timestamp`, code = `$${values.length}`;
    conditions.push(direction === "older" ? `(${c.timestamp}, ${c.code}) < (${ts}, ${code})` : `(${c.timestamp}, ${c.code}) > (${ts}, ${code})`);
  }
  const order = direction === "older" ? "DESC" : "ASC";
  const { rows } = await bankPool().query<{ code: string; ts: string }>(
    `SELECT ${c.code} code, to_char(${c.timestamp}, 'YYYY-MM-DD"T"HH24:MI:SS.US') ts FROM ${c.from}
     WHERE ${conditions.join(" AND ")} ORDER BY ${c.timestamp} ${order}, ${c.code} ${order} LIMIT ${Math.floor(limit)}`,
    values,
  );
  const items = await fetchItemsByCode(type, rows.map((r) => r.code));
  // The raw timestamp (not the ISO conversion) is what the next cursor must compare against.
  const toCursor = (row?: { ts: string; code: string }) => (row ? { ts: row.ts, code: row.code } : null);
  return { items, first: toCursor(rows[0]), next: toCursor(rows.at(-1)) };
}
