// Writes an executive brief (BriefData, report version 2) for one scope and one finished period: the numbers straight from
// the bank, every one with the period before it for comparison, then an AI assessment through the lens of the profile's
// institution. Source timestamps are Jakarta wall-clock times, so a calendar day is `ts >= 'day'::date AND ts < 'day'::date + 1`.
import type { AiSetting } from "@prisma/client";
import { accountKind } from "@/lib/ai/accountKind";
import { stripCodes } from "@/lib/ai/summary";
import {
  briefAiSchema, heatFromIssues, type ActorRow, type BriefAi, type BriefData, type BriefProfile, type CategoryRow, type DayRow,
  type EmotionRow, type IssueRow, type Metric, type PlatformRow,
} from "@/lib/brief";
import type { KeyScope } from "@/lib/media/keyScope";
import { allowsType, OPEN_SCOPE } from "@/lib/media/keyScope";
import { sourceLabel } from "@/lib/media/labels";
import { moodPolarity } from "@/lib/media/mood";
import type { MediaItem } from "@/lib/media/types";
import { ONT_PERIODS, type OntIssue } from "@/lib/ontologi";
import { daysBetween, KIND_LABEL, periodLabel, shiftDay, type ReportKind } from "@/lib/report";
import { listItems } from "./bank";
import { issueNews, listIssues } from "./bank/issues";
import { ontologiIssues } from "./bank/ontologi";
import { withLongTimeout } from "./bank/pool";
import { buildWhere, COLUMNS } from "./bank/query";
import { prisma } from "./db";
import { getSetting, loggedCall, monthCost } from "./ai/summary";
import { brands, COMMENTS, engagementScore, itemLabel, itemLine, LIKES, Refs, SHARES, topEngaged, VIEWS } from "./ai/summaryInput";
import { providerErrorMessage } from "./ai/providers";

/** Platforms the bank does not collect; named in the limitations section. */
const NOT_COLLECTED = ["grup WhatsApp/Telegram", "komentar di bawah unggahan", "siaran TV/radio"];
const TOP_ISSUES = 10;
const TOP_NEWS_ISSUES = 6;
const TOP_ACTORS = 10;
const INTER = `(${LIKES} + ${COMMENTS} + ${SHARES})`;
const S = COLUMNS.social, O = COLUMNS.online;

const jakartaDay = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
/** The calendar date a source timestamp falls on. node-pg reads zone-less timestamps as local time, so local getters give back the stored wall clock. */
const wallDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const n = (v: number) => Math.round(v).toLocaleString("id-ID");
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);
const delta = (m: Metric) => (m.prev && m.prev > 0 ? `${m.now >= m.prev ? "+" : ""}${Math.round(((m.now - m.prev) / m.prev) * 100)}%` : "tanpa pembanding");
const clip = (s: string | null | undefined, max: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

type Range = { start: string; end: string };
type ScopeRef = { id: string; name: string; scope: KeyScope | undefined; keywords: string[] };

/** WHERE for one media type in `from`..`to` (whole days), plus a SQL flag for "in the current period" (from `start` on). */
function rangeWhere(type: "social" | "online", scope: KeyScope, from: string, to: string, start: string) {
  const { where, values } = buildWhere(type, new URLSearchParams({ from, to }), scope);
  values.push(start);
  return { where, values, cur: `${COLUMNS[type].timestamp} >= $${values.length}::date` };
}

// ---------------------------------------------------------------- numbers

async function socialNumbers(scope: KeyScope, cur: Range, prev: Range) {
  const { where, values, cur: isCur } = rangeWhere("social", scope, prev.start, cur.end, cur.start);
  return withLongTimeout(180_000, async (client) => {
    // One client runs one query at a time, so these go one after another.
    const queries = [
      () => client.query<{ src: string; cur: boolean; posts: number; inter: number; views: number | null; vn: number; last: string }>(
        `SELECT ${S.source} src, ${isCur} cur, count(*)::int posts, sum(${INTER})::float8 inter, sum(${VIEWS})::float8 views, count(${VIEWS})::int vn,
           to_char(max(${S.timestamp})::date, 'YYYY-MM-DD') last
         FROM ${S.from} WHERE ${where} GROUP BY 1, 2`, values),
      () => client.query<{ cur: boolean; n: number }>(
        `SELECT ${isCur} cur, count(DISTINCT ${S.source} || ':' || p.post_username)::int n FROM ${S.from}
         WHERE ${where} AND p.post_username IS NOT NULL AND p.post_username <> '' GROUP BY 1`, values),
      () => client.query<{ cur: boolean; m: string; n: number; intense: number }>(
        `SELECT ${isCur} cur, lower(${S.mood}) m, count(*)::int n, count(*) FILTER (WHERE a.emotion_level >= 4)::int intense
         FROM ${S.from} WHERE ${where} AND ${S.mood} IS NOT NULL AND ${S.mood} <> '' GROUP BY 1, 2`, values),
      () => client.query<{ d: string; posts: number; inter: number }>(
        `SELECT to_char(${S.timestamp}::date, 'YYYY-MM-DD') d, count(*)::int posts, sum(${INTER})::float8 inter
         FROM ${S.from} WHERE ${where} AND ${isCur} GROUP BY 1`, values),
      () => client.query<{ v: string; posts: number; inter: number }>(
        `SELECT lower(${S.category}) v, count(*)::int posts, sum(${INTER})::float8 inter FROM ${S.from}
         WHERE ${where} AND ${isCur} AND ${S.category} IS NOT NULL AND ${S.category} <> '' GROUP BY 1 ORDER BY 2 DESC LIMIT 10`, values),
      () => client.query<{ src: string; u: string; posts: number; inter: number }>(
        `SELECT ${S.source} src, p.post_username u, count(*)::int posts, sum(${INTER})::float8 inter FROM ${S.from}
         WHERE ${where} AND ${isCur} AND p.post_username IS NOT NULL AND p.post_username <> '' GROUP BY 1, 2 ORDER BY 4 DESC LIMIT ${TOP_ACTORS * 2}`, values),
    ] as const;
    const platforms = await queries[0](), accounts = await queries[1](), moods = await queries[2]();
    const daily = await queries[3](), categories = await queries[4](), top = await queries[5]();
    // Negative share of just the top accounts.
    const actorMoods = top.rows.length ? (await client.query<{ src: string; u: string; m: string; n: number }>(
      `SELECT ${S.source} src, p.post_username u, lower(${S.mood}) m, count(*)::int n FROM ${S.from}
       WHERE ${where} AND ${isCur} AND ${S.mood} IS NOT NULL AND (${S.source}, p.post_username) IN (SELECT * FROM unnest($${values.length + 1}::text[], $${values.length + 2}::text[]))
       GROUP BY 1, 2, 3`, [...values, top.rows.map((r) => r.src), top.rows.map((r) => r.u)])).rows : [];
    return { platforms: platforms.rows, accounts: accounts.rows, moods: moods.rows, daily: daily.rows, categories: categories.rows, top: top.rows, actorMoods };
  });
}

async function onlineNumbers(scope: KeyScope, cur: Range, prev: Range) {
  const { where, values, cur: isCur } = rangeWhere("online", scope, prev.start, cur.end, cur.start);
  return withLongTimeout(120_000, async (client) => (await client.query<{ d: string; cur: boolean; n: number }>(
    `SELECT to_char(${O.timestamp}::date, 'YYYY-MM-DD') d, ${isCur} cur, count(*)::int n FROM ${O.from} WHERE ${where} GROUP BY 1, 2`, values)).rows);
}

/** Posts, accounts, interactions, dominant emotion and highest emotion level of each early-warning cluster (its whole life). */
async function clusterMetrics(ids: string[]) {
  if (!ids.length) return new Map<string, { posts: number; accounts: number; inter: number; emotion: string | null; level: number | null }>();
  const rows = await withLongTimeout(90_000, async (client) => (await client.query<{ id: string; posts: number; accounts: number; inter: number; emotion: string | null; level: number | null }>(
    `SELECT cp.cluster_id::text id, count(DISTINCT p.id)::int posts, count(DISTINCT p.post_username)::int accounts, sum(${INTER})::float8 inter,
       mode() WITHIN GROUP (ORDER BY lower(a.emotion)) emotion, max(a.emotion_level)::int level
     FROM cluster_posts cp JOIN post_main p ON p.id = cp.post_id LEFT JOIN post_analyses a ON a.post_id = p.id
     WHERE cp.cluster_id = ANY($1::bigint[]) GROUP BY 1`, [ids])).rows);
  return new Map(rows.map((r) => [r.id, r]));
}

// ---------------------------------------------------------------- the brief

const KIND_CODE: Record<ReportKind, string> = { harian: "H", mingguan: "M", bulanan: "B" };

export async function buildBrief(ref: ScopeRef, kind: ReportKind, cur: Range, profile: BriefProfile): Promise<BriefData> {
  const s = ref.scope ?? OPEN_SCOPE;
  const days = daysBetween(cur.start, cur.end);
  const prev = { start: shiftDay(cur.start, -days), end: shiftDay(cur.start, -1) };
  const known = await brands().catch(() => [] as string[]);
  const hasSocial = allowsType(s, "social"), hasOnline = allowsType(s, "online");
  const back = daysBetween(prev.start, jakartaDay());
  const ontDays = ONT_PERIODS.find((p) => p.days >= back)?.days ?? 30;

  const [soc, onl, ews, newsIssues] = await Promise.all([
    hasSocial ? socialNumbers(s, cur, prev) : null,
    hasOnline ? onlineNumbers(s, cur, prev) : null,
    hasSocial ? ontologiIssues(ontDays, ref.scope) : Promise.resolve([] as OntIssue[]),
    hasOnline ? listIssues(daysBetween(cur.start, jakartaDay()), s.keywords, "nasional") : Promise.resolve([]),
  ]);

  // Social numbers, this period and the one before.
  const sum = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((t, r) => t + (f(r) || 0), 0);
  const pl = soc?.platforms ?? [];
  const curPl = pl.filter((r) => r.cur), prevPl = pl.filter((r) => !r.cur);
  const moodsCur = (soc?.moods ?? []).filter((r) => r.cur), moodsPrev = (soc?.moods ?? []).filter((r) => !r.cur);
  const negOf = (rows: { m: string; n: number }[]) => sum(rows.filter((r) => moodPolarity(r.m) === "neg"), (r) => r.n);
  const labelled = sum(moodsCur, (r) => r.n), labelledPrev = sum(moodsPrev, (r) => r.n);
  const postsNow = sum(curPl, (r) => r.posts), postsPrev = sum(prevPl, (r) => r.posts);
  const newsNow = sum((onl ?? []).filter((r) => r.cur), (r) => r.n), newsPrev = sum((onl ?? []).filter((r) => !r.cur), (r) => r.n);

  const inPeriod = (iso: string, r: Range) => { const d = wallDay(iso); return d >= r.start && d <= r.end; };
  const ewsCur = ews.filter((i) => inPeriod(i.sentAt, cur)).sort((a, b) => b.score - a.score);
  // A day often has few alerts of its own; issues sent in the two days before are still live for a daily decision.
  const carried = days === 1 && ewsCur.length < 3
    ? ews.filter((i) => inPeriod(i.sentAt, { start: shiftDay(cur.start, -2), end: shiftDay(cur.start, -1) })).sort((a, b) => b.score - a.score)
    : [];
  const ewsPrev = ews.filter((i) => inPeriod(i.sentAt, prev));
  const newsCur = newsIssues.filter((i) => wallDay(i.firstSeenAt) <= cur.end && wallDay(i.lastSeenAt) >= cur.start).slice(0, TOP_NEWS_ISSUES);

  const refs = new Refs();
  const topEws = [...ewsCur, ...carried].slice(0, TOP_ISSUES);
  const metrics = await clusterMetrics(topEws.map((i) => i.id)).catch(() => new Map());
  const issues: IssueRow[] = topEws.map((i) => {
    const m = metrics.get(i.id);
    return {
      code: refs.add("E", `Isu EWS: ${i.title}`, i.posts.find((p) => p.url)?.url ?? null), kind: "ews", title: i.title, level: i.level, score: i.score,
      posts: m?.posts ?? i.postCount, accounts: m?.accounts ?? null, interactions: m?.inter ?? null, emotion: m?.emotion ?? i.emotion, maxLevel: m?.level ?? null,
      location: i.location, actors: i.actors.slice(0, 4), targets: i.targets.slice(0, 4), sentDay: wallDay(i.sentAt),
    };
  });
  const headlines = new Map<string, string[]>();
  for (const i of newsCur) {
    const news = await issueNews(i.id, 1, null).catch(() => null);
    const items = (news?.items ?? []).filter((it) => wallDay(it.publishedAt) <= cur.end);
    const code = refs.add("I", `Isu berita: ${i.label || i.title}`, items[0]?.url ?? null);
    headlines.set(code, [
      `media: ${(news?.sources ?? []).slice(0, 4).map((x) => `${sourceLabel(x.source)} (${x.count})`).join(", ")}`,
      ...items.slice(0, 3).map((it) => `"${clip(it.title, 150)}" (${sourceLabel(it.source)}, ${wallDay(it.publishedAt)})`),
    ]);
    issues.push({ code, kind: "news", title: i.label || i.title, level: null, score: i.score, posts: i.newsCount, accounts: null, interactions: null, emotion: null, maxLevel: null, location: null, actors: [], targets: [], sentDay: null });
  }

  const negByAccount = new Map<string, { neg: number; labelled: number }>();
  for (const r of soc?.actorMoods ?? []) {
    const k = `${r.src}:${r.u}`, e = negByAccount.get(k) ?? { neg: 0, labelled: 0 };
    e.labelled += r.n; if (moodPolarity(r.m) === "neg") e.neg += r.n;
    negByAccount.set(k, e);
  }
  const actors: ActorRow[] = (soc?.top ?? []).slice(0, TOP_ACTORS).map((r) => {
    const e = negByAccount.get(`${r.src}:${r.u}`);
    return { username: r.u, source: r.src, kind: accountKind(r.u, known), posts: r.posts, interactions: r.inter ?? 0, negShare: e?.labelled ? pct(e.neg, e.labelled) : null };
  });

  const byDay = new Map((soc?.daily ?? []).map((r) => [r.d, r]));
  const newsByDay = new Map((onl ?? []).filter((r) => r.cur).map((r) => [r.d, r.n]));
  const daily: DayRow[] = Array.from({ length: days }, (_, i) => {
    const d = shiftDay(cur.start, i);
    return { day: d, posts: byDay.get(d)?.posts ?? 0, interactions: byDay.get(d)?.inter ?? 0, news: newsByDay.get(d) ?? 0 };
  });
  const platforms: PlatformRow[] = [...new Set(pl.map((r) => r.src))].map((src) => {
    const c = curPl.find((r) => r.src === src), p = prevPl.find((r) => r.src === src);
    return { source: src, posts: c?.posts ?? 0, interactions: c?.inter ?? 0, views: c && c.vn ? c.views : null, prevPosts: p?.posts ?? 0, lastDay: c?.last ?? p?.last ?? null };
  }).sort((a, b) => b.posts - a.posts);
  const emotions: EmotionRow[] = moodsCur.map((r) => ({ value: r.m, n: r.n, intense: r.intense })).sort((a, b) => b.n - a.n);
  const categories: CategoryRow[] = (soc?.categories ?? []).map((r) => ({ value: r.v, posts: r.posts, interactions: r.inter ?? 0 }));
  const viewsNow = sum(curPl, (r) => r.views ?? 0), viewsPrev = sum(prevPl, (r) => r.views ?? 0);

  const data: BriefData = {
    version: 2, kind, start: cur.start, day: cur.end, days, at: new Date().toISOString(),
    number: `SB/LE-${KIND_CODE[kind]}/${cur.end.replace(/-/g, "")}/${ref.id === "bank" ? "BANK" : ref.id.slice(0, 6).toUpperCase()}`,
    scope: { id: ref.id, name: ref.name, keywords: ref.keywords },
    profile,
    kpi: {
      posts: { now: postsNow, prev: postsPrev },
      accounts: { now: soc?.accounts.find((r) => r.cur)?.n ?? 0, prev: soc?.accounts.find((r) => !r.cur)?.n ?? 0 },
      interactions: { now: sum(curPl, (r) => r.inter), prev: sum(prevPl, (r) => r.inter) },
      views: { now: viewsNow, prev: viewsPrev },
      news: { now: newsNow, prev: newsPrev },
      negShare: { now: pct(negOf(moodsCur), labelled), prev: labelledPrev ? pct(negOf(moodsPrev), labelledPrev) : null },
      ews: { now: ewsCur.length, prev: ewsPrev.length },
      critical: ewsCur.filter((i) => i.level === "Critical").length,
    },
    daily, platforms, emotions, labelledShare: postsNow ? pct(labelled, postsNow) : null, categories, actors, issues,
    sources: {}, notCollected: NOT_COLLECTED, ai: null, aiError: null,
  };

  // Samples the assessment reads alongside the numbers.
  const samples = hasSocial ? await socialSamples(s, cur, refs, known) : [];
  const previous = await previousBrief(ref.id, kind, prev.end);
  const input = assessmentInput(data, topEws, headlines, samples, previous);
  const assessed = await assess(ref, data, input);
  data.ai = assessed.ai ? cleanCodes(assessed.ai, refs.map) : null;
  data.aiError = assessed.error;
  data.sources = Object.fromEntries(refs.map);
  return data;
}

/** Public posts with the most engagement, strongest negative ones, and the outlet posts with the most engagement. */
async function socialSamples(scope: KeyScope, cur: Range, refs: Refs, known: readonly string[]) {
  const range = { from: cur.start, to: cur.end };
  const [top, hot] = await Promise.all([
    topEngaged(scope, cur.start, cur.end, 60),
    listItems("social", new URLSearchParams({ ...range, level: "4" }), scope, { limit: 80, offset: 0 }),
  ]);
  const kind = (i: MediaItem) => accountKind(i.author?.username, known);
  const seen = new Set<string>();
  const take = (items: MediaItem[], keep: (i: MediaItem) => boolean, count: number) => items
    .filter((i) => !seen.has(i.code) && clip(i.content || i.title, 10) && keep(i)).slice(0, count).map((i) => { seen.add(i.code); return i; });
  const groups: [string, MediaItem[]][] = [
    ["Akun publik dengan interaksi tertinggi", take(top, (i) => kind(i) === "publik", 10)],
    ["Akun publik bernada negatif berintensitas tinggi", take([...hot].sort((a, b) => engagementScore(b) - engagementScore(a)), (i) => kind(i) === "publik" && !!i.mood && moodPolarity(i.mood) === "neg", 6)],
    ["Akun media/institusi dengan interaksi tertinggi", take(top, (i) => kind(i) !== "publik", 4)],
  ];
  return groups.flatMap(([title, items]) => (items.length ? [`## ${title}`, ...items.map((i) => itemLine(refs.add("S", itemLabel(i), i.url), i, kind(i)))] : []));
}

/** The assessment of the period before, for the follow-up section. */
async function previousBrief(scope: string, kind: ReportKind, prevEnd: string) {
  const row = await prisma.archivedReport.findFirst({ where: { scope, kind, day: prevEnd }, select: { data: true } });
  const d = row?.data as BriefData | undefined;
  return d?.version === 2 && d.ai ? { period: periodLabel(d), ai: d.ai } : null;
}

// ---------------------------------------------------------------- assessment

function assessmentInput(d: BriefData, ews: OntIssue[], headlines: Map<string, string[]>, samples: string[], previous: { period: string; ai: BriefAi } | null) {
  const k = d.kpi, p = d.profile;
  const prevLabel = d.days === 1 ? "hari sebelumnya" : `${d.days} hari sebelumnya`;
  const reader = p.recipientTitle || p.institution
    ? `${p.recipientTitle || "pimpinan"}${p.recipientName ? ` (${p.recipientName})` : ""}${p.institution ? `, institusi: ${p.institution}` : ""}${p.region ? `, wilayah: ${p.region}` : ""}`
    : `pimpinan pengguna proyek "${d.scope.name}" (profil penerima belum diisi; tulis untuk pimpinan lembaga secara umum)`;
  const ewsLines = d.issues.filter((i) => i.kind === "ews").map((i) => {
    const o = ews.find((x) => x.title === i.title);
    return [
      `[${i.code}] ${i.level}, skor ${i.score}, terkirim ${i.sentDay}${i.sentDay && i.sentDay < d.start ? " (sebelum periode, masih aktif)" : ""}, ${n(i.posts)} unggahan, ${i.accounts ?? "?"} akun, ${i.interactions === null ? "?" : n(i.interactions)} interaksi (resonansi ${i.interactions && i.posts ? n(i.interactions / i.posts) : "?"}/unggahan), emosi dominan ${i.emotion ?? "?"}${i.maxLevel ? ` (level tertinggi L${i.maxLevel})` : ""} — "${clip(i.title, 140)}"`,
      [i.actors.length && `aktor: ${i.actors.join(", ")}`, i.targets.length && `target: ${i.targets.join(", ")}`, i.location && `lokasi: ${i.location}`].filter(Boolean).join(" · "),
      o?.summary && `Peristiwa: ${clip(o.summary, 320)}`, o?.reaction && `Reaksi publik: ${clip(o.reaction, 220)}`, o?.risk && `Risiko (sistem): ${clip(o.risk, 220)}`,
    ].filter(Boolean).map((l, j) => (j ? `  ${l}` : l)).join("\n");
  });
  const newsLines = d.issues.filter((i) => i.kind === "news").map((i) => [`[${i.code}] "${clip(i.title, 140)}" · ${n(i.posts)} berita dalam klaster`, ...(headlines.get(i.code) ?? []).map((h) => `  ${h}`)].join("\n"));
  return [
    `Laporan ${KIND_LABEL[d.kind].toUpperCase()} untuk: ${reader}.`,
    p.partners.length ? `Mitra koordinasi yang relevan: ${p.partners.join(", ")}.` : "Mitra koordinasi belum diisi (kosongkan bagian mitra kecuali jelas dari data).",
    `Cakupan data: ${d.scope.name}${d.scope.keywords.length ? ` (kata kunci: ${d.scope.keywords.join(", ")})` : ""}.`,
    `Periode data: ${periodLabel(d)} (${d.days} hari penuh, 00.00-24.00 WIB). Pembanding: ${prevLabel}. Laporan dibaca ${jakartaDay()}.`,
    "",
    "# ANGKA KUNCI (periode ini | pembanding | perubahan)",
    `- Unggahan media sosial: ${n(k.posts.now)} | ${n(k.posts.prev ?? 0)} | ${delta(k.posts)}`,
    `- Akun unik: ${n(k.accounts.now)} | ${n(k.accounts.prev ?? 0)} | ${delta(k.accounts)}`,
    `- Total interaksi (suka+komentar+bagikan): ${n(k.interactions.now)} | ${n(k.interactions.prev ?? 0)} | ${delta(k.interactions)}`,
    `- Total tayangan (hanya platform yang mencatat): ${n(k.views.now)} | ${n(k.views.prev ?? 0)} | ${delta(k.views)}`,
    `- Artikel media online: ${n(k.news.now)} | ${n(k.news.prev ?? 0)} | ${delta(k.news)}`,
    `- Porsi negatif media sosial (dari ${d.labelledShare ?? 0}% unggahan berlabel emosi): ${k.negShare.now}% | ${k.negShare.prev ?? "?"}%`,
    `- Isu peringatan dini (EWS): ${k.ews.now} (${k.critical} Critical) | ${k.ews.prev ?? 0}`,
    "",
    "# TREN HARIAN (tanggal: unggahan / interaksi / berita)",
    d.daily.map((x) => `${x.day.slice(5)}: ${n(x.posts)} / ${n(x.interactions)} / ${n(x.news)}`).join("; "),
    "",
    "# PLATFORM (unggahan, interaksi, tayangan, data terakhir)",
    ...d.platforms.map((x) => `- ${sourceLabel(x.source)}: ${n(x.posts)} unggahan (pembanding ${n(x.prevPosts)}), ${n(x.interactions)} interaksi, ${x.views === null ? "tayangan tidak dicatat" : `${n(x.views)} tayangan`}, data terakhir ${x.lastDay ?? "-"}`),
    "",
    "# EMOSI MEDIA SOSIAL (jumlah, di antaranya level >= 4)",
    d.emotions.slice(0, 8).map((e) => `${e.value} ${n(e.n)} (${n(e.intense)})`).join("; ") || "(belum ada label)",
    "",
    "# KATEGORI (unggahan, interaksi, resonansi = interaksi per unggahan)",
    ...d.categories.map((c) => `- ${c.value}: ${n(c.posts)} unggahan, ${n(c.interactions)} interaksi, resonansi ${c.posts ? n(c.interactions / c.posts) : 0}`),
    "",
    "# AKTOR DIGITAL DENGAN INTERAKSI TERTINGGI",
    ...d.actors.map((a) => `- @${a.username} (${sourceLabel(a.source)}, ${a.kind === "publik" ? "akun publik" : `akun ${a.kind}`}): ${n(a.posts)} unggahan, ${n(a.interactions)} interaksi${a.negShare === null ? "" : `, ${a.negShare}% negatif`}`),
    "",
    "# ISU PERINGATAN DINI MEDIA SOSIAL (kode E, angka sepanjang umur klaster)",
    ...(ewsLines.length ? ewsLines : ["(tidak ada isu EWS dalam periode)"]),
    "",
    "# ISU BERITA TERATAS (kode I)",
    ...(newsLines.length ? newsLines : ["(tidak ada)"]),
    "",
    "# SAMPEL UNGGAHAN (kode S)",
    ...(samples.length ? samples : ["(tidak ada)"]),
    "",
    previous
      ? `# LAPORAN SEBELUMNYA (${previous.period})\nSuhu: ${previous.ai.suhu.level}, momentum ${previous.ai.suhu.momentum}.\nTindakan yang direkomendasikan:\n${previous.ai.matriks.map((m, i) => `${i + 1}. ${m.tindakan} (${m.waktu}, ${m.prioritas})`).join("\n") || "(tidak ada)"}`
      : "# LAPORAN SEBELUMNYA\n(tidak ada; kosongkan tindakLanjut)",
  ].join("\n");
}

const SYSTEM_PROMPT = (kind: ReportKind) => `Anda analis intelijen media senior yang menulis LAPORAN EKSEKUTIF berbentuk dokumen keputusan untuk satu pejabat (lihat "Laporan untuk"). Seluruh analisis memakai lensa institusi pembaca: apa yang harus DIPUTUSKAN pejabat itu, bukan laporan umum.

STANDAR
1. Tajam, profesional, padat. Kesimpulan di depan. Kalimat aktif dan pendek. Tanpa basa-basi, tanpa kata "signifikan" tanpa angka.
2. Hanya fakta dari data. Jangan mengarang nama, angka, tanggal, kutipan, atau peristiwa. Fakta dari berita/sampel adalah "menurut pemberitaan/unggahan", bukan kepastian.
3. Setiap angka jelas periodenya ("dalam periode", "dibanding periode sebelumnya", "sepanjang klaster"). Jangan mencampur periode.
4. Bedakan fakta (fakta, detail) dan penilaian (implikasi). Implikasi menjawab: mengapa penting bagi institusi pembaca, risikonya, dan apa yang terjadi 24-72 jam (harian) atau 1-2 pekan (mingguan/bulanan) bila didiamkan.
5. Tindakan spesifik: siapa/apa, terhadap isu/aktor/wilayah mana, kapan (tenggat konkret seperti "SEGERA", "SEBELUM 20 NOV", "PEKAN INI"), dan alasan dari data. Dilarang tindakan generik ("tingkatkan pemantauan", "koordinasi lintas sektor") tanpa objek dan tenggat.
6. Bukti: isi "evidence" dan "kode" hanya dengan kode yang ada di data (E1, I2, S3). Jangan menulis kode di dalam kalimat.
7. Resonansi = interaksi per unggahan. Isu bervolume kecil tetapi beresonansi tinggi atau menyerang legitimasi institusi tetap bisa prioritas tinggi.
8. Privasi: samarkan nama anak di bawah umur dan korban kekerasan seksual (pakai inisial/usia). Akun warga biasa diberi label netral (mis. "akun kritik warga", "agregator info lokal"), bukan "musuh". Pejabat publik, lembaga, dan akun media boleh disebut.
9. Disinformasi: isi hanya bila sampel/isu menunjukkan klaim yang dibantah atau patut diverifikasi; status misalnya "belum diklarifikasi", "sudah dibantah oleh …". Bila tidak ada, kosongkan.
10. Tindak lanjut: nilai setiap tindakan laporan sebelumnya dari data periode ini ("terlihat" bila ada pemberitaan/unggahan yang menunjukkan tindakan itu dilakukan, "sebagian", "belum terlihat", atau "tidak dapat dinilai"). Jangan menebak.
11. Kalender hanya berisi tanggal mendatang yang disebut eksplisit di data (sidang, tenggat, agenda). Bila tidak ada, kosongkan.
12. Keterbatasan: sebut cakupan label emosi, platform tanpa data di sebagian periode (lihat "data terakhir"), dan hal yang tidak dipantau.

JUMLAH UNTUK LAPORAN ${KIND_LABEL[kind].toUpperCase()}
${kind === "harian"
    ? "temuan 2, kartu 3 isu terpenting, isuLain maks 4, matriks 3-5, pemicu 3-4, platform 2-3, aktor 5, mitra 0-3, kalender 0-3, evaluasi kosongkan."
    : kind === "mingguan"
      ? "temuan 4, kartu 4-5, isuLain maks 6, matriks 6-9, pemicu 5-6, platform 3-4, aktor 6-8, mitra 2-5, kalender 2-6, evaluasi kosongkan."
      : "temuan 4, kartu 5, isuLain maks 6, matriks 6-10, pemicu 5-7, platform 3-5, aktor 6-8, mitra 2-6, kalender 2-8, evaluasi wajib: 4-6 kalimat evaluasi sebulan (pola, efektivitas tindakan, proyeksi bulan depan)."}

Kembalikan HANYA objek JSON valid:
{
  "suhu": { "level": "TINGGI|WASPADA|TERKENDALI", "momentum": "NAIK|STABIL|MENURUN", "ringkas": "2-3 kalimat: suhu, arah momentum dengan angka, posisi institusi" },
  "keputusan": { "pengantar": "1 kalimat: berapa isu menuntut keputusan dan sampai kapan", "isu": [ { "judul": "isu dan keputusan yang dibutuhkan", "tenggat": "SEGERA|SEBELUM ..." } ] },
  "temuan": [ { "judul": "temuan strategis maks 8 kata", "isi": "2-3 kalimat dengan angka", "evidence": ["E1"] } ],
  "catatanKpi": { "posts": "catatan singkat bagi pembaca", "accounts": "...", "interactions": "...", "views": "...", "news": "...", "negShare": "...", "ews": "..." },
  "tren": { "judul": "kesimpulan tren maks 8 kata", "isi": "2-3 kalimat dan implikasi keputusan" },
  "platform": [ { "tujuan": "mis. Jangkauan massa", "kanal": "platform", "alasan": "alasan dari data" } ],
  "isuRelevansi": [ { "kode": "E1", "relevansi": "relevansi bagi institusi, maks 10 kata" } ],
  "emosi": "2 kalimat bacaan emosi publik, termasuk indikator kerawanan sebenarnya",
  "aktor": [ { "akun": "username tanpa @", "karakter": "mis. Agregator info lokal", "tindakan": "tindakan bagi institusi" } ],
  "konten": "2-3 kalimat: kategori yang menembus (resonansi tinggi) vs yang gagal, implikasi komunikasi",
  "kartu": [ { "kode": "E1", "judul": "judul isu", "fakta": ["fakta kunci kronologis dengan tanggal bila ada"], "implikasi": "penilaian bagi institusi", "tindakan": "tindakan spesifik", "tenggat": "SEGERA|SEBELUM ...", "keyakinan": "tinggi|sedang|rendah", "evidence": ["E1","S2"] } ],
  "isuLain": [ { "kode": "E6", "inti": "inti fakta", "tindakan": "implikasi dan tindakan singkat" } ],
  "matriks": [ { "tindakan": "tindakan spesifik", "waktu": "SEGERA|SEBELUM ...", "kode": "E1", "prioritas": "SEGERA|TINGGI|SEDANG|RENDAH" } ],
  "mitra": [ { "mitra": "nama mitra dari daftar", "kebutuhan": "apa yang dibutuhkan/ditawarkan" } ],
  "kalender": [ { "tanggal": "20 Nov", "peristiwa": "agenda dari data", "catatan": "mengapa penting" } ],
  "pemicu": [ { "sinyal": "sinyal terukur yang menuntut respons dalam hitungan jam", "kode": "E1", "eskalasi": "HIGH → CRITICAL" } ],
  "tindakLanjut": [ { "tindakan": "tindakan dari laporan sebelumnya", "status": "terlihat|sebagian|belum terlihat|tidak dapat dinilai", "catatan": "bukti dari data" } ],
  "disinformasi": [ { "narasi": "klaim yang beredar", "status": "status verifikasi", "evidence": ["S4"] } ],
  "evaluasi": "khusus bulanan",
  "prioritas": ["tiga prioritas mendesak, masing-masing dengan tenggat"],
  "keterbatasan": "2-3 kalimat keterbatasan data"
}`;

/** Asks the platform AI for the assessment; never throws, an unavailable or failed AI leaves the numbers-only report. */
async function assess(ref: ScopeRef, d: BriefData, input: string): Promise<{ ai: BriefAi | null; error: string | null }> {
  let setting: AiSetting | null = null;
  try { setting = await getSetting(); } catch { /* treated as not configured */ }
  if (!setting?.providerKeyEnc) return { ai: null, error: "Penyedia AI belum diatur, narasi analisis tidak tersedia." };
  if (setting.monthlyBudget != null && (await monthCost()) >= setting.monthlyBudget) return { ai: null, error: "Batas biaya AI bulanan tercapai, narasi analisis tidak dibuat." };
  try {
    const { raw, log } = await loggedCall(setting, "report", { id: ref.id, name: `${ref.name} · ${KIND_LABEL[d.kind]} ${d.day}` }, SYSTEM_PROMPT(d.kind), input, 32_000);
    const parsed = briefAiSchema.safeParse(raw);
    if (!parsed.success) { await log(false, "Jawaban model tidak sesuai format"); return { ai: null, error: "Narasi analisis gagal dibuat (format jawaban AI tidak valid)." }; }
    await log(true, null);
    return { ai: parsed.data, error: null };
  } catch (error) {
    return { ai: null, error: `Narasi analisis gagal dibuat: ${providerErrorMessage(error)}` };
  }
}

/** Drops cited codes the input never had and strips codes the model wrote into prose. */
function cleanCodes(ai: BriefAi, refs: Map<string, unknown>): BriefAi {
  const keep = (codes: string[]) => codes.filter((c) => refs.has(c));
  const code = (c: string | undefined) => (c && refs.has(c.trim().toUpperCase()) ? c.trim().toUpperCase() : undefined);
  const walk = (v: unknown, key = ""): unknown => {
    if (typeof v === "string") return key === "kode" || key === "akun" ? v : stripCodes(v);
    if (Array.isArray(v)) return key === "evidence" ? keep(v as string[]) : v.map((x) => walk(x));
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]));
    return v;
  };
  const out = walk(ai) as BriefAi;
  return {
    ...out,
    kartu: out.kartu.map((x) => ({ ...x, kode: code(x.kode) ?? x.kode })),
    matriks: out.matriks.map((x) => ({ ...x, kode: code(x.kode) })),
    pemicu: out.pemicu.map((x) => ({ ...x, kode: x.kode?.split(/[+,\s]+/).map(code).filter(Boolean).join("+") || undefined })),
  };
}

export function heatOf(d: BriefData) {
  return d.ai?.suhu.level ?? heatFromIssues(d.issues);
}
