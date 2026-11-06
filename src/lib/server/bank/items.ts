// Reading posts and articles from the source database.
import type { Analysis, MediaItem, MediaType, Relevance } from "@/lib/media/types";
import { bankPool } from "./pool";
import { buildWhere, COLUMNS } from "./query";
import { cleanSummary } from "./summary";

const RELEVANCE: Relevance[] = ["include", "watchlist", "exclude"];

const safeUrl = (url: string | null) => (url && /^https?:\/\//i.test(url) ? url : null);
const toNumber = (v: unknown) => (v === undefined || v === null || v === "" ? null : Number(v) || 0);
const toStrings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x) : []);

// Both selects return the same column names so one mapper handles either type.
// Author, username, post URL and follower counts are deliberately never read.
const SELECT = {
  social: `
    p.post_code code, p.post_source source, NULL title, p.post_content content, NULL url, NULL image, p.post_timestamps ts,
    p.post_type "postType", p.additional_data extra, a.category, a.location, lower(a.emotion) mood, a.emotion_level "moodLevel", pr.name province,
    a.id analysis_id, a.summaries summary, a.emotion_target target, a.emotion_score score, a.signal signals, a.factors,
    a.status_filter relevance, NULL topics
    FROM ${COLUMNS.social.from} LEFT JOIN region_indonesia_provinces pr ON pr.province_code = a.province_id::text
    WHERE p.post_code = ANY($1)`,
  online: `
    n.news_code code, n.news_source source, n.news_title title, n.news_preview content, n.news_url url, n.news_image image, n.news_timestamp ts,
    NULL "postType", NULL extra, n.news_category_label category, NULL location, lower(a.sentiment) mood, NULL "moodLevel", pr.name province,
    a.id analysis_id, NULL summary, NULL target, NULL score, NULL signals, NULL factors, NULL relevance, a.topics
    FROM ${COLUMNS.online.from} LEFT JOIN region_indonesia_provinces pr ON pr.province_code = n.region_code
    WHERE n.news_code = ANY($1)`,
};

/* eslint-disable @typescript-eslint/no-explicit-any -- raw pg rows */
function toAnalysis(row: any): Analysis | null {
  if (row.analysis_id == null) return null;
  return {
    summary: cleanSummary(row.summary),
    target: row.target || null,
    score: row.score == null ? null : Number(row.score),
    signals: toStrings(row.signals),
    topics: toStrings(row.topics?.items),
    factors: row.factors && typeof row.factors === "object" && !Array.isArray(row.factors) ? row.factors : null,
    relevance: RELEVANCE.includes(row.relevance) ? row.relevance : null,
  };
}

function toItem(row: any): MediaItem {
  const extra = row.extra ?? {};
  return {
    code: row.code,
    source: row.source,
    title: row.title,
    content: row.content,
    url: safeUrl(row.url),
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
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Full items for the given codes, in the order given. */
export async function fetchItemsByCode(type: MediaType, codes: string[]): Promise<MediaItem[]> {
  if (!codes.length) return [];
  const { rows } = await bankPool().query(`SELECT ${SELECT[type]}`, [codes]);
  const byCode = new Map(rows.map((row) => [row.code, row]));
  return codes.flatMap((code) => (byCode.has(code) ? [toItem(byCode.get(code))] : []));
}

/** `limit` matching items starting at `offset`, newest first unless sort=oldest. */
export async function listItems(type: MediaType, params: URLSearchParams, keywords: string[], { limit, offset }: { limit: number; offset: number }) {
  const c = COLUMNS[type];
  const { where, values } = buildWhere(type, params, keywords);
  const direction = params.get("sort") === "oldest" ? "ASC" : "DESC";
  const { rows } = await bankPool().query<{ code: string }>(
    `SELECT ${c.code} code FROM ${c.from} WHERE ${where} ORDER BY ${c.timestamp} ${direction} LIMIT ${Math.floor(limit)} OFFSET ${Math.floor(offset)}`,
    values,
  );
  return fetchItemsByCode(type, rows.map((r) => r.code));
}
