import { Pool } from "pg";

// Read-only connection to bankkomen: the raw social media & online news collection.
const g = globalThis as unknown as { bankPool?: Pool };
function pool() {
  const connectionString = process.env.BANKKOMEN_DATABASE_URL;
  if (!connectionString) throw new Error("BANKKOMEN_DATABASE_URL belum diatur");
  g.bankPool ??= new Pool({
    connectionString, max: 4, connectionTimeoutMillis: 10_000, statement_timeout: 25_000,
    ssl: { rejectUnauthorized: false }, options: "-c default_transaction_read_only=on",
  });
  return g.bankPool;
}

export type MediaType = "sosial" | "online";
export const isType = (t: string): t is MediaType => t === "sosial" || t === "online";

// Only content about the police. "polisi tidur" is a speed bump, not the police.
const POLICE = "(polisi & !(polisi <-> tidur)) | polri | polda | polres | polsek | kepolisian | kapolri | kapolda | kapolres | kapolsek | bhabinkamtibmas";
const isDate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const safeUrl = (u: string | null) => (u && /^https?:\/\//i.test(u) ? u : null);
const num = (v: unknown) => (v === undefined || v === null || v === "" ? null : Number(v) || 0);

// Every filter value is passed as a bound parameter.
function buildWhere(type: MediaType, s: URLSearchParams) {
  const params: unknown[] = [POLICE];
  const add = (v: unknown) => `$${params.push(v)}`;
  const social = type === "sosial";
  const ts = social ? "p.post_timestamps" : "n.news_timestamp";
  const tsv = social ? "p.post_content_tsv" : "n.news_title_tsv";
  const where = [`${tsv} @@ to_tsquery('simple', $1)`, `${ts} >= '2010-01-01'`, `${ts} <= now()`];
  const q = s.get("q")?.trim();
  if (q) where.push(`${tsv} @@ plainto_tsquery('simple', ${add(q.slice(0, 200))})`);
  const from = s.get("from"), to = s.get("to");
  if (isDate(from)) where.push(`${ts} >= ${add(from)}::date`);
  if (isDate(to)) where.push(`${ts} < ${add(to)}::date + 1`);
  const source = s.get("source");
  if (source) where.push(`${social ? "p.post_source" : "n.news_source"} = ${add(source)}`);
  const mood = s.get("mood");
  if (mood) where.push(`lower(${social ? "a.emotion" : "a.sentiment"}) = lower(${add(mood.slice(0, 40))})`);
  if (social) where.push(`p.post_type IS DISTINCT FROM 'spam'`);
  return { where: where.join(" AND "), params, ts };
}

const fromClause = (type: MediaType) => type === "sosial"
  ? "post_main p LEFT JOIN post_analyses a ON a.post_id = p.id"
  : "news_main n LEFT JOIN news_analyses a ON a.news_code = n.news_code";

// Short-lived cache so paging through the same filters doesn't rescan millions of rows.
const cache = new Map<string, { at: number; data: Promise<unknown> }>();
function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 120_000) return hit.data as Promise<T>;
  const data = load();
  data.catch(() => cache.delete(key));
  cache.set(key, { at: Date.now(), data });
  if (cache.size > 100) cache.delete(cache.keys().next().value!);
  return data;
}
export const clearCache = () => cache.clear();

const CANDIDATES = 3000;
// Newest matching codes, for the review queue.
export function candidateCodes(type: MediaType, s: URLSearchParams) {
  const key = [type, ...["q", "from", "to", "source", "mood"].map((k) => s.get(k) ?? "")].join("|");
  return cached(key, async () => {
    const { where, params, ts } = buildWhere(type, s);
    const code = type === "sosial" ? "p.post_code" : "n.news_code";
    const { rows } = await pool().query<{ code: string }>(
      `SELECT ${code} code FROM ${fromClause(type)} WHERE ${where} ORDER BY ${ts} DESC LIMIT ${CANDIDATES}`, params);
    return rows.map((r) => r.code);
  });
}

export type BankItem = {
  code: string; source: string; title: string | null; content: string | null; url: string | null; image: string | null;
  postType: string | null; category: string | null; province: string | null; location: string | null;
  publishedAt: string; mood: string | null; moodLevel: number | null;
  metrics: { likes: number | null; comments: number | null; shares: number | null; views: number | null };
};

// Full rows for the given codes, in the order given. No author or account details are read.
export async function byCodes(type: MediaType, codes: string[]): Promise<BankItem[]> {
  if (!codes.length) return [];
  const social = type === "sosial";
  const select = social
    ? `p.post_code code, p.post_source source, NULL title, p.post_content content, NULL url, NULL image, p.post_timestamps ts,
       p.post_type "postType", p.additional_data extra, a.category, a.location, lower(a.emotion) mood, a.emotion_level "moodLevel", pr.name province
       FROM ${fromClause(type)} LEFT JOIN region_indonesia_provinces pr ON pr.province_code = a.province_id::text WHERE p.post_code = ANY($1)`
    : `n.news_code code, n.news_source source, n.news_title title, n.news_preview content, n.news_url url, n.news_image image, n.news_timestamp ts,
       NULL "postType", NULL extra, n.news_category_label category, NULL location, lower(a.sentiment) mood, NULL "moodLevel", pr.name province
       FROM ${fromClause(type)} LEFT JOIN region_indonesia_provinces pr ON pr.province_code = n.region_code WHERE n.news_code = ANY($1)`;
  const { rows } = await pool().query(`SELECT ${select}`, [codes]);
  const byCode = new Map(rows.map((r) => [r.code, r]));
  return codes.flatMap((c) => {
    const r = byCode.get(c);
    if (!r) return [];
    const x = r.extra ?? {};
    return [{
      code: r.code, source: r.source, title: r.title, content: r.content, url: safeUrl(r.url), image: safeUrl(r.image),
      postType: r.postType, category: r.category, province: r.province, location: r.location,
      publishedAt: new Date(r.ts).toISOString(), mood: r.mood, moodLevel: r.moodLevel,
      metrics: { likes: num(x.like), comments: num(x.comment), shares: num(x.retweet ?? x.share), views: num(x.view) },
    }];
  });
}

// Filter choices; slow to compute and barely changing, so kept an hour.
const optionsCache = new Map<MediaType, { at: number; data: { sources: string[]; moods: string[] } }>();
export async function bankOptions(type: MediaType) {
  const hit = optionsCache.get(type);
  if (hit && Date.now() - hit.at < 3_600_000) return hit.data;
  const social = type === "sosial";
  const [sources, moods] = await Promise.all([
    pool().query(social ? `SELECT DISTINCT post_source value FROM post_main WHERE post_timestamps > now() - interval '30 days' AND post_source IS NOT NULL ORDER BY 1`
      : `SELECT DISTINCT news_source value FROM news_main WHERE news_timestamp > now() - interval '30 days' AND news_source IS NOT NULL ORDER BY 1`),
    social ? pool().query(`SELECT lower(emotion) value, count(*) n FROM post_analyses WHERE created_at > now() - interval '30 days' AND emotion <> '' GROUP BY 1 ORDER BY n DESC LIMIT 20`)
      : Promise.resolve({ rows: [{ value: "positive" }, { value: "neutral" }, { value: "negative" }] }),
  ]);
  const data = { sources: sources.rows.map((r) => r.value as string), moods: moods.rows.map((r) => r.value as string) };
  optionsCache.set(type, { at: Date.now(), data });
  return data;
}
