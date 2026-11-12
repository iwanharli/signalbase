import { allowsType, OPEN_SCOPE, type KeyScope } from "@/lib/media/keyScope";
import { decodeTextEntities } from "@/lib/media/text";
import { buildGraph, SNA_POSTS, type SnaAccount, type SnaPost, type SnaRole, childrenPerHub, emptyHubs, type SnaDays, type SnaLimit, type SnaGraph, type SnaHub, type SnaRow } from "@/lib/sna";
import { sharedCache } from "./cache";
import { analyticsPool } from "./pool";
import { buildWhere, COLUMNS, filterKey } from "./query";

const cache = sharedCache<SnaGraph>("sna", { ttlMs: 60_000, maxEntries: 50, staleWhileRevalidate: true });

/**
 * Social mention graph of the last `days` days (rolling, Jakarta wall-clock like the stored timestamps): the `limit` accounts
 * with the most posts (that mention someone) are the hubs; the accounts they mention are the children; each link's tone is
 * the emotion of the posts carrying the mention. The whole bank, or one key's scope when given.
 */
export function snaGraph(days: SnaDays, limit: SnaLimit, scope?: KeyScope) {
  const s = scope ?? OPEN_SCOPE;
  return cache(`${days}|${limit}|${filterKey("social", new URLSearchParams(), s)}`, async () => {
    if (!allowsType(s, "social")) return emptyHubs();
    const since = new Date(Date.now() - days * 86_400_000).toLocaleString("sv-SE", { timeZone: "Asia/Jakarta" });
    const { where, values } = buildWhere("social", new URLSearchParams({ since }), s);
    const from = COLUMNS.social.from;
    const pool = analyticsPool();
    const { rows: hubs } = await pool.query<SnaHub>(
      `SELECT p.post_username username, mode() WITHIN GROUP (ORDER BY p.post_source) source, count(*)::int posts FROM ${from}
       WHERE ${where} AND p.post_username <> '' AND EXISTS (SELECT 1 FROM post_mentioned m WHERE m.post_code = p.post_code)
       GROUP BY 1 ORDER BY 3 DESC LIMIT ${limit}`, values);
    if (!hubs.length) return emptyHubs();
    const { rows } = await pool.query<SnaRow>(
      `SELECT p.post_username hub, m.username_target target, lower(a.emotion) emotion, count(*)::int n FROM ${from}
       JOIN post_mentioned m ON m.post_code = p.post_code
       WHERE ${where} AND p.post_username = ANY($${values.length + 1}::text[]) AND m.username_target <> p.post_username
       GROUP BY 1, 2, 3`, [...values, hubs.map((h) => h.username)]);
    return buildGraph(hubs, rows, childrenPerHub(limit));
  });
}

const accountCache = sharedCache<SnaAccount>("sna-account", { ttlMs: 60_000, maxEntries: 200, staleWhileRevalidate: true });
type PostRow = { code: string; source: string; username: string | null; content: string | null; url: string | null; ts: Date; emotion: string | null };
const safeUrl = (u: string | null) => (u && /^https?:\/\//i.test(u) ? u : null);

/** The posts behind one node in the window: a hub's own posts that mention someone, or (child) the posts mentioning it. */
export function snaAccount(username: string, role: SnaRole, days: SnaDays, scope?: KeyScope) {
  const s = scope ?? OPEN_SCOPE;
  return accountCache(`${role}|${username}|${days}|${filterKey("social", new URLSearchParams(), s)}`, async () => {
    if (!allowsType(s, "social")) return { posts: [], buckets: [] };
    const since = new Date(Date.now() - days * 86_400_000).toLocaleString("sv-SE", { timeZone: "Asia/Jakarta" });
    const { where, values } = buildWhere("social", new URLSearchParams({ since }), s);
    const who = `$${values.length + 1}`;
    const cond = role === "hub"
      ? `p.post_username = ${who} AND EXISTS (SELECT 1 FROM post_mentioned m WHERE m.post_code = p.post_code)`
      : `EXISTS (SELECT 1 FROM post_mentioned m WHERE m.post_code = p.post_code AND m.username_target = ${who})`;
    const from = COLUMNS.social.from, pool = analyticsPool(), args = [...values, username];
    const [posts, buckets] = await Promise.all([
      pool.query<PostRow>(
        `SELECT p.post_code code, p.post_source source, p.post_username username, left(p.post_content, 280) content, p.post_url url, p.post_timestamps ts, lower(a.emotion) emotion
         FROM ${from} WHERE ${where} AND ${cond} ORDER BY p.post_timestamps DESC LIMIT ${SNA_POSTS}`, args),
      pool.query<{ key: string; n: number }>(
        `SELECT to_char(p.post_timestamps, '${days === 1 ? "YYYY-MM-DD HH24" : "YYYY-MM-DD"}') key, count(*)::int n FROM ${from} WHERE ${where} AND ${cond} GROUP BY 1 ORDER BY 1`, args),
    ]);
    return {
      posts: posts.rows.map((r): SnaPost => ({ code: r.code, source: r.source, username: r.username, content: decodeTextEntities(r.content ?? ""), url: safeUrl(r.url), ts: new Date(r.ts).toISOString(), emotion: r.emotion })),
      buckets: buckets.rows,
    };
  });
}
