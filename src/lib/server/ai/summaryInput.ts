// What Ringkasan AI reads for one scope and one complete Jakarta calendar day (normally yesterday, once its data is in):
// that day's numbers against the 7 days before it, the day's early-warning issues (social) and news issues (online),
// samples of the day's posts and news, and the previous summary. Every issue and item gets a short code (E1, I1, S1, B1)
// the model cites as evidence; the server turns cited codes into links on the card.
//
// Source timestamps are Jakarta wall-clock times without a zone, so a calendar day is `ts >= 'day'::date AND ts < 'day'::date + 1`
// (the from/to filters of buildWhere).
import { accountKind, mediaBrands, type AccountKind } from "@/lib/ai/accountKind";
import type { SourceRef } from "@/lib/ai/summary";
import { allowsType, OPEN_SCOPE, type KeyScope } from "@/lib/media/keyScope";
import { MEDIA_TYPE_LABEL, sourceLabel } from "@/lib/media/labels";
import { moodPolarity } from "@/lib/media/mood";
import { MEDIA_TYPES, type MediaItem, type MediaType } from "@/lib/media/types";
import type { OntIssue } from "@/lib/ontologi";
import { fetchItemsByCode, listItems } from "../bank";
import { issueNews, listIssues } from "../bank/issues";
import { ontologiIssues } from "../bank/ontologi";
import { bankPool, withLongTimeout } from "../bank/pool";
import { buildWhere, COLUMNS, keywordQuery } from "../bank/query";

/** Days before the data day used as the "normal" baseline. */
const BASELINE_DAYS = 7;
const EWS_ISSUES = 6;
const NEWS_ISSUES = 6;
const HEADLINES_PER_ISSUE = 2;
const TOP_SOCIAL = 10;
/** Outlet and institution accounts kept in the social sample; the rest is the public's own voice. */
const TOP_MEDIA_SOCIAL = 3;
const NEGATIVE_SOCIAL = 6;
const POSITIVE_SOCIAL = 4;
const LATEST_NEWS = 6;
const TOP_SOURCES = 6;
const ITEM_CHARS = 400;
const INTENSE_LEVEL = 5;
const SPIKE_MIN = 10;
const SPIKE_RATIO = 2;
const FACEBOOK_MAX = 50_000;

const DAY_MS = 86_400_000;
const pct = (now: number, before: number) => (before > 0 ? `${now >= before ? "+" : ""}${Math.round(((now - before) / before) * 100)}%` : "tanpa pembanding");
const share = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "n/a");
const clip = (s: string | null | undefined, max = ITEM_CHARS) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const n = (v: number) => Math.round(v).toLocaleString("id-ID");

/** The calendar date `offset` days from `day` (both YYYY-MM-DD). */
export const shiftDay = (day: string, offset: number) => new Date(Date.parse(`${day}T12:00:00Z`) + offset * DAY_MS).toISOString().slice(0, 10);
/** "Kamis, 12 November 2026". */
export const longDate = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
/** The calendar date a source timestamp falls on. node-pg reads zone-less timestamps as local time, so local getters give back the stored wall clock. */
const wallDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Hands out codes per kind and remembers what each one points to. */
export class Refs {
  readonly map = new Map<string, Omit<SourceRef, "id">>();
  private next: Record<string, number> = {};
  add(prefix: "S" | "B" | "E" | "I", label: string, url: string | null) {
    const id = `${prefix}${(this.next[prefix] = (this.next[prefix] ?? 0) + 1)}`;
    this.map.set(id, { label: clip(label, 90), url: url && /^https?:\/\//i.test(url) ? url : null });
    return id;
  }
}

// ---------------------------------------------------------------- media accounts

const KIND_LABEL: Record<AccountKind, string> = { media: "akun media", institusi: "akun institusi", publik: "akun publik" };
const BRANDS_TTL_MS = 6 * 3_600_000;

/** Outlet brands from the news sources seen in the last 30 days, refreshed every few hours. */
export async function brands(): Promise<string[]> {
  const g = globalThis as unknown as { sbMediaBrands?: { at: number; list: string[] } };
  if (g.sbMediaBrands && Date.now() - g.sbMediaBrands.at < BRANDS_TTL_MS) return g.sbMediaBrands.list;
  const { rows } = await bankPool().query<{ s: string }>(`SELECT DISTINCT ${COLUMNS.online.source} s FROM news_main n WHERE ${COLUMNS.online.timestamp} >= now() - interval '30 days' AND ${COLUMNS.online.source} IS NOT NULL`);
  g.sbMediaBrands = { at: Date.now(), list: mediaBrands(rows.map((r) => r.s)) };
  return g.sbMediaBrands.list;
}

// ---------------------------------------------------------------- numbers of one calendar day

/** A number expression for one engagement field of a social post; scraper outliers count as 0 (same rules as insights). */
const metric = (fields: string[]) => {
  const c = COLUMNS.social;
  const v = `coalesce(${fields.map((f) => `p.additional_data->>'${f}'`).join(", ")})`;
  return `coalesce(CASE WHEN ${v} ~ '^[0-9]{1,7}$' AND (${c.source} <> 'facebook' OR (${v})::bigint < ${FACEBOOK_MAX}) THEN (${v})::bigint END, 0)`;
};
export const LIKES = metric(["like"]), COMMENTS = metric(["comment", "reply", "komentar"]), SHARES = metric(["retweet", "repost", "share"]);
/** Views pass 10 million on big videos, so they only need to be a sane number (as in insights). */
export const VIEWS = `CASE WHEN p.additional_data->>'view' ~ '^[0-9]{1,10}$' THEN (p.additional_data->>'view')::bigint END`;

type Totals = { total: number; labelled: number; pos: number; neg: number; hot: number; cats: Map<string, number> };
const emptyTotals = (): Totals => ({ total: 0, labelled: 0, pos: 0, neg: 0, hot: 0, cats: new Map() });

/** Counts per calendar day (the data day and the 7 before), by polarity, intensity and category. */
async function perDay(type: MediaType, scope: KeyScope, day: string) {
  const c = COLUMNS[type];
  const first = shiftDay(day, -BASELINE_DAYS);
  const { where, values } = buildWhere(type, new URLSearchParams({ from: first, to: day }), scope);
  const hot = type === "social" ? `coalesce(a.emotion_level >= ${INTENSE_LEVEL}, false)` : "false";
  const rows = await withLongTimeout(120_000, async (client) => (await client.query<{ d: string; m: string | null; cat: string | null; hot: boolean; n: number }>(
    `SELECT to_char(${c.timestamp}::date, 'YYYY-MM-DD') d, lower(${c.mood}) m, lower(${c.category}) cat, ${hot} hot, count(*)::int n
     FROM ${c.from} WHERE ${where} GROUP BY 1, 2, 3, 4`, values)).rows);
  const days = Array.from({ length: BASELINE_DAYS + 1 }, (_, i) => shiftDay(first, i));
  const totals = new Map(days.map((d) => [d, emptyTotals()]));
  for (const r of rows) {
    const t = totals.get(r.d);
    if (!t) continue;
    t.total += r.n;
    if (r.m) {
      const side = moodPolarity(r.m);
      t.labelled += r.n;
      if (side === "pos") t.pos += r.n;
      if (side === "neg") { t.neg += r.n; if (r.hot) t.hot += r.n; }
    }
    if (r.cat) t.cats.set(r.cat, (t.cats.get(r.cat) ?? 0) + r.n);
  }
  return { days, totals };
}

/** Most active accounts (social) or outlets (online) on the day, with their negative share. */
async function topSources(type: MediaType, scope: KeyScope, day: string) {
  const c = COLUMNS[type];
  const { where, values } = buildWhere(type, new URLSearchParams({ from: day, to: day }), scope);
  const social = type === "social";
  const who = social ? `${c.source} src, p.post_username u` : `${c.source} src, '' u`;
  const rows = await withLongTimeout(90_000, async (client) => (await client.query<{ src: string; u: string; m: string | null; n: number }>(
    `SELECT ${who}, lower(${c.mood}) m, count(*)::int n FROM ${c.from}
     WHERE ${where} AND ${c.source} IS NOT NULL${social ? " AND p.post_username IS NOT NULL AND p.post_username <> ''" : ""} GROUP BY 1, 2, 3`, values)).rows);
  const by = new Map<string, { src: string; u: string; n: number; labelled: number; neg: number }>();
  for (const r of rows) {
    const key = `${r.src}\u0001${r.u}`;
    const e = by.get(key) ?? { src: r.src, u: r.u, n: 0, labelled: 0, neg: 0 };
    e.n += r.n;
    if (r.m) { e.labelled += r.n; if (moodPolarity(r.m) === "neg") e.neg += r.n; }
    by.set(key, e);
  }
  return [...by.values()].sort((a, b) => b.n - a.n).slice(0, social ? 60 : TOP_SOURCES);
}

/** Likes, comments and shares per platform on the day. */
async function engagementOn(scope: KeyScope, day: string) {
  const c = COLUMNS.social;
  const { where, values } = buildWhere("social", new URLSearchParams({ from: day, to: day }), scope);
  return withLongTimeout(90_000, async (client) => (await client.query<{ src: string; posts: number; likes: number; comments: number; shares: number }>(
    `SELECT ${c.source} src, count(*)::int posts, sum(${LIKES})::float8 likes, sum(${COMMENTS})::float8 comments, sum(${SHARES})::float8 shares
     FROM ${c.from} WHERE ${where} GROUP BY 1 ORDER BY 2 DESC LIMIT 5`, values)).rows);
}

/** Most used hashtags in the day's posts. */
async function hashtagsOn(scope: KeyScope, day: string) {
  const c = COLUMNS.social;
  const { where, values } = buildWhere("social", new URLSearchParams({ from: day, to: day }), scope);
  return withLongTimeout(90_000, async (client) => (await client.query<{ tag: string; n: number }>(
    `SELECT lower(r.m[1]) tag, count(*)::int n FROM (SELECT p.post_content FROM ${c.from} WHERE ${where} LIMIT 8000) s
     CROSS JOIN LATERAL regexp_matches(s.post_content, '#([[:alnum:]_]{2,40})', 'g') r(m) GROUP BY 1 ORDER BY 2 DESC LIMIT 8`, values)).rows);
}

/** Per keyword of a project: matches on the day, the daily average of the 7 days before, and negative matches on the day. */
async function keywordsOn(type: MediaType, scope: KeyScope, day: string) {
  const keywords = scope.keywords.filter((k) => keywordQuery([k]));
  if (keywords.length < 2) return null;
  const c = COLUMNS[type];
  const { where, values } = buildWhere(type, new URLSearchParams({ from: shiftDay(day, -BASELINE_DAYS), to: day }), scope);
  const cols = keywords.map((k, i) => {
    values.push(keywordQuery([k]));
    return `count(*) FILTER (WHERE ${c.search} @@ to_tsquery('indonesian', $${values.length}))::int k${i}`;
  });
  values.push(day);
  const rows = await withLongTimeout(90_000, async (client) => (await client.query<Record<string, number | string | boolean | null>>(
    `SELECT ${c.timestamp}::date = $${values.length}::date cur, lower(${c.mood}) m, ${cols.join(", ")} FROM ${c.from} WHERE ${where} GROUP BY 1, 2`, values)).rows);
  return keywords.map((value, i) => {
    let now = 0, before = 0, neg = 0;
    for (const r of rows) {
      const k = Number(r[`k${i}`]);
      if (r.cur) { now += k; if (typeof r.m === "string" && moodPolarity(r.m) === "neg") neg += k; } else before += k;
    }
    return { value, now, avg: before / BASELINE_DAYS, neg };
  }).sort((a, b) => b.now - a.now);
}

/** The day's numbers for one media type as lines the model can read, or null when the day has no items. */
async function statsBlock(type: MediaType, scope: KeyScope, day: string, known: readonly string[]) {
  const social = type === "social";
  const [{ days, totals }, sources, engagement, tags, keywords] = await Promise.all([
    perDay(type, scope, day),
    topSources(type, scope, day),
    social ? engagementOn(scope, day) : null,
    social ? hashtagsOn(scope, day).catch(() => []) : null,
    keywordsOn(type, scope, day).catch(() => null),
  ]);
  const t = totals.get(day)!;
  if (!t.total) return null;
  const base = days.slice(0, -1).map((d) => totals.get(d)!);
  const avg = (pick: (x: Totals) => number) => base.reduce((s, x) => s + pick(x), 0) / BASELINE_DAYS;
  const avgLabelled = avg((x) => x.labelled);
  const unit = social ? "post" : "berita";
  const lines = [
    `[${MEDIA_TYPE_LABEL[type].toUpperCase()} · ${longDate(day)} (satu hari penuh), dibanding rata-rata harian 7 hari sebelumnya]`,
    `- Volume: ${n(t.total)} ${unit} (rata-rata ${n(avg((x) => x.total))}/hari, ${pct(t.total, avg((x) => x.total))}).`,
    `- Berlabel emosi/sentimen: ${share(t.labelled, t.total)}. Negatif ${share(t.neg, t.labelled)} (rata-rata ${share(avg((x) => x.neg), avgLabelled)}), positif ${share(t.pos, t.labelled)} (rata-rata ${share(avg((x) => x.pos), avgLabelled)}).`,
  ];
  if (social) lines.push(`- Post negatif berintensitas tinggi: ${n(t.hot)} (rata-rata ${n(avg((x) => x.hot))}/hari).`);
  lines.push(`- Volume per hari, 8 hari (tanggal: total/negatif): ${days.map((d) => `${d.slice(5)}: ${n(totals.get(d)!.total)}/${n(totals.get(d)!.neg)}`).join(", ")}.`);

  const cats = [...t.cats].sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (cats.length) lines.push(`- Kategori teratas: ${cats.map(([cat, v]) => { const a = avg((x) => x.cats.get(cat) ?? 0); return `${cat} ${n(v)} (rata-rata ${n(a)}/hari, ${pct(v, a)})`; }).join("; ")}.`);
  for (const [cat, v] of t.cats) {
    const a = avg((x) => x.cats.get(cat) ?? 0);
    if (v >= SPIKE_MIN && v >= Math.max(1, a) * SPIKE_RATIO) lines.push(`- LONJAKAN: kategori "${cat}" ${n(v)} ${unit} vs rata-rata ${n(a)}/hari.`);
  }
  if (keywords?.length) {
    lines.push(`- Kata kunci proyek: ${keywords.map((k) => `${k.value} ${n(k.now)} (rata-rata ${n(k.avg)}/hari, ${pct(k.now, k.avg)}, negatif ${n(k.neg)})`).join("; ")}.`);
    for (const k of keywords) if (k.now >= SPIKE_MIN && k.now >= Math.max(1, k.avg) * SPIKE_RATIO) lines.push(`- LONJAKAN: kata kunci "${k.value}" ${n(k.now)} vs rata-rata ${n(k.avg)}/hari.`);
  }
  if (tags?.length) lines.push(`- Hashtag teratas: ${tags.map((r) => `#${r.tag} ${n(r.n)}`).join(", ")}.`);
  if (sources.length && social) {
    const account = (a: (typeof sources)[number]) => `@${a.u} (${sourceLabel(a.src)}) ${n(a.n)} post, ${share(a.neg, a.labelled)} negatif`;
    const pub = sources.filter((a) => accountKind(a.u, known) === "publik").slice(0, TOP_SOURCES);
    const org = sources.filter((a) => accountKind(a.u, known) !== "publik").slice(0, 4);
    if (pub.length) lines.push(`- Akun publik (non-media) paling aktif: ${pub.map(account).join("; ")}.`);
    if (org.length) lines.push(`- Akun media/institusi paling aktif: ${org.map(account).join("; ")}.`);
  } else if (sources.length) {
    lines.push(`- Media paling aktif: ${sources.map((m) => `${sourceLabel(m.src)} ${n(m.n)} berita, ${share(m.neg, m.labelled)} negatif`).join("; ")}.`);
  }
  if (engagement?.length) lines.push(`- Interaksi per platform: ${engagement.map((e) => `${sourceLabel(e.src)} ${n(e.posts)} post, ${n(e.likes)} suka, ${n(e.comments)} komentar, ${n(e.shares)} bagikan`).join("; ")}.`);
  return lines.join("\n");
}

// ---------------------------------------------------------------- issues

/** Early-warning issues sent on the day; the 3 days up to it when the day itself had fewer than 3. Highest score first. */
async function ewsBlock(scope: KeyScope, day: string, refs: Refs) {
  const recent = (await ontologiIssues(3, scope)).filter((i) => wallDay(i.sentAt) <= day);
  let issues: OntIssue[] = recent.filter((i) => wallDay(i.sentAt) === day);
  let window = `pada ${longDate(day)}`;
  if (issues.length < 3) { issues = recent.filter((i) => wallDay(i.sentAt) >= shiftDay(day, -2)); window = `3 hari hingga ${longDate(day)}`; }
  if (!issues.length) return null;
  const lines = issues.slice(0, EWS_ISSUES).map((i) => {
    const id = refs.add("E", `Isu EWS: ${i.title}`, i.posts.find((p) => p.url)?.url ?? null);
    const who = [i.actors.length && `aktor: ${i.actors.slice(0, 4).join(", ")}`, i.targets.length && `target: ${i.targets.slice(0, 4).join(", ")}`, i.location && `lokasi: ${i.location}`, i.emotion && `emosi dominan: ${i.emotion}`]
      .filter(Boolean).join(" · ");
    return [
      `[${id}] ${i.level}, skor ${Math.round(i.score)}, ${n(i.postCount)} post, terkirim ${wallDay(i.sentAt)} — "${clip(i.title, 140)}"${who ? `\n  ${who}` : ""}`,
      i.summary && `  Peristiwa: ${clip(i.summary, 300)}`,
      i.reaction && `  Reaksi publik: ${clip(i.reaction, 220)}`,
      i.risk && `  Penilaian risiko (sistem): ${clip(i.risk, 220)}`,
    ].filter(Boolean).join("\n");
  });
  return [`# ISU PERINGATAN DINI MEDIA SOSIAL (${window}, skor tertinggi)`, ...lines].join("\n");
}

/** The highest-scoring news clusters active on the day, each with its headlines up to that day and busiest outlets. */
async function newsIssuesBlock(scope: KeyScope, day: string, refs: Refs) {
  const codes = new Set<string>();
  const issues = (await listIssues(3, scope.keywords, "nasional"))
    .filter((i) => wallDay(i.firstSeenAt) <= day && wallDay(i.lastSeenAt) >= day).slice(0, NEWS_ISSUES);
  if (!issues.length) return { text: null, codes };
  const lines = await Promise.all(issues.map(async (i) => {
    const news = await issueNews(i.id, 1, null).catch(() => null);
    const items = (news?.items ?? []).filter((it) => wallDay(it.publishedAt) <= day);
    const title = i.label || i.title;
    const id = refs.add("I", `Isu berita: ${title}`, items[0]?.url ?? null);
    const outlets = news?.sources?.slice(0, 4).map((s) => `${sourceLabel(s.source)} (${s.count})`).join(", ");
    const heads = items.slice(0, HEADLINES_PER_ISSUE).map((it) => {
      codes.add(it.code);
      return `  - "${clip(it.title, 150)}" (${sourceLabel(it.source)}, ${wallDay(it.publishedAt)})`;
    });
    return [`[${id}] "${clip(title, 140)}" · ${n(i.newsCount)} berita dalam klaster sejak ${wallDay(i.firstSeenAt)} · skor ${i.score.toFixed(1)}${outlets ? ` · media: ${outlets}` : ""}`, ...heads].join("\n");
  }));
  return { text: [`# ISU BERITA TERATAS (klaster yang aktif pada ${longDate(day)}, skor tertinggi)`, ...lines].join("\n"), codes };
}

// ---------------------------------------------------------------- samples

/** Social posts of the days `from`..`to` with the most likes, comments and shares. */
export async function topEngaged(scope: KeyScope, from: string, to: string, limit: number) {
  const c = COLUMNS.social;
  const { where, values } = buildWhere("social", new URLSearchParams({ from, to }), scope);
  const rows = await withLongTimeout(90_000, async (client) => (await client.query<{ code: string }>(
    `SELECT ${c.code} code FROM ${c.from} WHERE ${where} ORDER BY ${LIKES} + 2 * ${COMMENTS} + 3 * ${SHARES} DESC, ${c.timestamp} DESC LIMIT ${limit}`, values)).rows);
  return fetchItemsByCode("social", rows.map((r) => r.code));
}

export const engagementScore = (i: MediaItem) => (i.metrics.likes ?? 0) + 2 * (i.metrics.comments ?? 0) + 3 * (i.metrics.shares ?? 0);

export function itemLine(id: string, item: MediaItem, kind?: AccountKind) {
  const who = item.author?.username ? ` · @${item.author.username}${kind ? ` (${KIND_LABEL[kind]})` : ""}` : "";
  const m = item.metrics;
  const metrics = [m.likes && `${n(m.likes)} suka`, m.comments && `${n(m.comments)} komentar`, m.shares && `${n(m.shares)} bagikan`].filter(Boolean).join(", ");
  const mood = item.mood ? ` · ${item.mood}${item.moodLevel ? ` (level ${item.moodLevel})` : ""}` : "";
  const text = item.title ? `${clip(item.title, 160)} — ${clip(item.content, ITEM_CHARS - 160)}` : clip(item.content);
  return `[${id}] ${sourceLabel(item.source)}${who}${mood}${metrics ? ` · ${metrics}` : ""}\n  ${text}`;
}

export const itemLabel = (item: MediaItem) => item.title
  ? `${sourceLabel(item.source)}: ${item.title}`
  : `${sourceLabel(item.source)}${item.author?.username ? ` @${item.author.username}` : ""}: ${clip(item.content, 60)}`;

/** Social: what the public itself posted (most engaged, strongest negative, a few positive), plus the few outlet and
 *  institution posts with the most engagement. Outlets dominate raw engagement, so without the split the "public" sample
 *  would mostly be news headlines again. */
async function socialSamples(scope: KeyScope, day: string, refs: Refs, known: readonly string[]) {
  const range = { from: day, to: day };
  const [top, hot, recent] = await Promise.all([
    topEngaged(scope, day, day, 60),
    listItems("social", new URLSearchParams({ ...range, level: "4" }), scope, { limit: 60, offset: 0 }),
    listItems("social", new URLSearchParams(range), scope, { limit: 200, offset: 0 }),
  ]);
  const kind = (i: MediaItem) => accountKind(i.author?.username, known);
  const usable = (i: MediaItem) => !!clip(i.content || i.title);
  const seen = new Set<string>();
  const take = (items: MediaItem[], keep: (i: MediaItem) => boolean, count: number) => items
    .filter((i) => !seen.has(i.code) && usable(i) && keep(i)).slice(0, count)
    .map((i) => { seen.add(i.code); return i; });
  const byEngagement = (items: MediaItem[]) => [...items].sort((a, b) => engagementScore(b) - engagementScore(a));
  const isPublic = (i: MediaItem) => kind(i) === "publik";
  const groups: [string, MediaItem[]][] = [
    ["Akun publik dengan interaksi tertinggi", take(top, isPublic, TOP_SOCIAL)],
    ["Akun publik bernada negatif berintensitas tinggi", take(byEngagement(hot), (i) => isPublic(i) && !!i.mood && moodPolarity(i.mood) === "neg", NEGATIVE_SOCIAL)],
    ["Akun publik bernada positif", take(byEngagement(recent), (i) => isPublic(i) && !!i.mood && moodPolarity(i.mood) === "pos", POSITIVE_SOCIAL)],
    ["Akun media/institusi dengan interaksi tertinggi (pembanding framing)", take(top, (i) => !isPublic(i), TOP_MEDIA_SOCIAL)],
  ];
  return groups.flatMap(([title, items]) => items.length
    ? [`## ${title}`, ...items.map((i) => itemLine(refs.add("S", itemLabel(i), i.url), i, kind(i)))]
    : []);
}

/** Online: the day's news not already shown under a news issue. */
async function newsSamples(scope: KeyScope, day: string, refs: Refs, skip: Set<string>) {
  const items = (await listItems("online", new URLSearchParams({ from: day, to: day }), scope, { limit: LATEST_NEWS * 3, offset: 0 }))
    .filter((i) => !skip.has(i.code)).slice(0, LATEST_NEWS);
  return items.length ? ["## Berita lain di luar klaster di atas", ...items.map((i) => itemLine(refs.add("B", itemLabel(i), i.url), i))] : [];
}

// ---------------------------------------------------------------- the whole message

export type PreviousSummary = { day: string; headline: string; highlights: string[] };

/** The user message for one scope and data day plus what each code points to; null when the day has no items in scope. */
export async function buildInput(scope: KeyScope | undefined, name: string, keywords: string[], day: string, previous: PreviousSummary | null) {
  const s = scope ?? OPEN_SCOPE;
  const types = MEDIA_TYPES.filter((type) => allowsType(s, type));
  const known = await brands().catch(() => [] as string[]);
  const stats = await Promise.all(types.map(async (type) => ({ type, text: await statsBlock(type, s, day, known) })));
  const has = (type: MediaType) => !!stats.find((t) => t.type === type)?.text;
  if (!types.some(has)) return null;

  const refs = new Refs();
  // Issues first, so their codes come before the samples'.
  const ews = has("social") ? await ewsBlock(s, day, refs).catch(() => null) : null;
  const newsIssues = has("online") ? await newsIssuesBlock(s, day, refs).catch(() => ({ text: null, codes: new Set<string>() })) : { text: null, codes: new Set<string>() };
  const social = has("social") ? await socialSamples(s, day, refs, known) : [];
  const news = has("online") ? await newsSamples(s, day, refs, newsIssues.codes) : [];

  const text = [
    `Cakupan: ${name}${keywords.length ? ` (kata kunci proyek: ${keywords.join(", ")})` : ""}.`,
    `Hari data: ${longDate(day)}, satu hari penuh 00.00-24.00 WIB. Briefing dibaca keesokan paginya.`,
    previous ? `Ringkasan sebelumnya (data ${longDate(previous.day)}): "${previous.headline}". Sorotan: ${previous.highlights.join("; ")}.` : "Tidak ada ringkasan sebelumnya.",
    "",
    "# STATISTIK",
    ...stats.flatMap((t) => (t.text ? [t.text, ""] : [])),
    ...(ews ? [ews, ""] : []),
    ...(newsIssues.text ? [newsIssues.text, ""] : []),
    "# SAMPEL MEDIA SOSIAL HARI DATA",
    ...(social.length ? social : ["(tidak ada)"]),
    "",
    "# SAMPEL BERITA HARI DATA",
    ...(news.length ? news : ["(tidak ada)"]),
  ].join("\n");
  return { text, refs: refs.map };
}

export const SYSTEM_PROMPT = `Anda analis intelijen media senior. Pembaca Anda pimpinan lembaga di Indonesia yang membaca briefing ini pagi hari, punya waktu 1 menit, dan harus memutuskan apa yang dilakukan hari ini.
Tulis briefing dari data SATU HARI PENUH (hari data, biasanya kemarin): statistik, isu peringatan dini (kode E), isu berita (kode I), sampel post (kode S) dan berita (kode B).

PRINSIP
1. Bottom line up front. Headline = satu perkembangan paling berdampak pada hari data, sebagai kalimat lengkap dengan angka kunci. Bukan label topik.
2. Setiap angka wajib jelas periodenya: angka hari data ditulis "pada [tanggal]" atau "kemarin"; pembanding ditulis "rata-rata 7 hari sebelumnya"; angka klaster isu ditulis sesuai periodenya. Jangan menggabungkan angka dari periode berbeda seolah satu periode. Jangan menulis "24 jam terakhir".
3. Hanya fakta dari data. Jangan mengarang nama, angka, kutipan, atau peristiwa. Sampel adalah contoh, bukan seluruh data: simpulkan tema dari sampel, bukan volume.
4. Bedakan fakta dan penilaian. "detail" berisi fakta beserta angkanya. "implication" berisi penilaian Anda: mengapa penting, siapa terdampak, apa yang mungkin terjadi 24-72 jam ke depan.
5. Prioritaskan yang berubah dan berisiko: lonjakan, pergeseran sentimen, isu peringatan dini level Critical/High, aktor yang menggerakkan narasi. Hal yang stabil cukup satu kalimat di overview.
6. Bukti: setiap sorotan wajib mengutip 1-4 kode sumber di "evidence" (contoh ["E1","S4"]). Hanya kode yang ada di data. Jangan menulis kode di dalam teks kalimat.
7. Gunakan "Ringkasan sebelumnya" untuk menilai tren: "baru" (belum ada sebelumnya), "naik", "stabil", atau "turun".
8. Rekomendasi harus spesifik: tindakan apa, terhadap isu/aktor/wilayah mana, kapan, dan alasannya dari data. Dilarang rekomendasi generik seperti "tingkatkan pemantauan" atau "pantau perkembangan" tanpa objek, pemicu, dan ambang yang jelas.
9. Media sosial adalah suara publik. Bedakan akun publik dari akun media/institusi (ditandai di sampel). Di "publicConversation" jelaskan narasi dominan warganet sendiri, siapa penggeraknya (jenis akun, kelompok, atau akun publik yang menonjol), dan bedanya dengan framing media. Minimal satu sorotan harus tentang dinamika media sosial (pergeseran opini, narasi warganet, aktor penggerak, atau tagar), bukan sekadar mengulang berita.
10. "watch" berisi indikator yang perlu diawasi hari ini beserta pemicunya, misalnya "Bila X melewati Y, ...".
11. Keyakinan: nilai dari volume data, cakupan label, dan keterwakilan sampel. Sebut keterbatasan utamanya dengan jujur dan singkat.
12. Bahasa Indonesia baku, kalimat aktif dan pendek, tanpa basa-basi, tanpa mengulang fakta yang sama di beberapa bagian. Parafrasekan isi post, jangan menyalin.

DEFINISI
- impact "tinggi": isu peringatan dini Critical, lonjakan 2x atau lebih dari rata-rata, atau berpotensi memengaruhi keamanan, kebijakan, atau reputasi lembaga dalam 72 jam. "sedang": perlu diketahui pimpinan. "rendah": konteks.
- sentiment: arah opini publik terhadap isu itu (positif, netral, negatif), atau "waspada" bila berpotensi memicu eskalasi.

Kembalikan HANYA objek JSON valid dengan bentuk persis:
{
  "headline": "kalimat inti hari data, maks 30 kata",
  "overview": "3-4 kalimat: situasi umum, apa yang berubah dibanding biasanya, dan penilaian Anda",
  "sentiment": { "tone": "positif|netral|negatif|waspada", "note": "satu kalimat arah opini publik, dengan angka" },
  "publicConversation": { "summary": "2-3 kalimat narasi dominan di kalangan warganet", "drivers": ["penggerak percakapan, maks 8 kata per butir"], "vsMedia": "1 kalimat beda sudut pandang publik vs media", "evidence": ["S2"] },
  "highlights": [
    { "title": "judul isu, maks 8 kata", "detail": "fakta 1-2 kalimat dengan angka", "implication": "penilaian 1-2 kalimat", "impact": "tinggi|sedang|rendah", "sentiment": "positif|netral|negatif|waspada", "trend": "baru|naik|stabil|turun", "evidence": ["E1"] }
  ],
  "watch": [ { "text": "indikator dan pemicunya, maks 30 kata", "evidence": ["I2"] } ],
  "actions": [ { "action": "tindakan spesifik, maks 20 kata", "reason": "alasan dari data, maks 25 kata" } ],
  "confidence": { "level": "tinggi|sedang|rendah", "note": "dasar penilaian dan keterbatasan utama, 1 kalimat" }
}
highlights 3-5 butir diurutkan dari impact tertinggi, watch 1-3 butir, actions 1-3 butir.`;
