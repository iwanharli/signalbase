// Local media analysis (npm run media): collects the images of new items from the source database (read-only) and has the
// local service (scripts/media/layanan_media.py, MEDIA_SERVICE_URL) read their text (OCR), tag them and fingerprint them.
// Feeds: news images (news_main.news_image and images in the article body), X photos, video posters and frames (through
// originalXPost), YouTube thumbnails and frames, Instagram posts (every carousel slide and Reel frames, from the official embed
// page; og:image otherwise) and Threads post images (og:image). Speech of X videos and Reels is transcribed (transcribePending).
// Facebook (post pages ask to log in) and TikTok (oEmbed returns no thumbnail) are not collected.
//
// Each tick: collect per feed the new items (head cursor) and, while a backlog remains, older ones from today backwards
// (back cursor), then analyse pending images, newest posts first. Nothing
// is stored but the URL and the results; one image used by many items is analysed once (MediaAsset.urlHash).
import { createHash } from "node:crypto";
import { prisma } from "../db";
import { bankPool } from "../bank/pool";
import { originalXPost } from "../xPost";
import { xPostId } from "@/lib/media/xPost";
import { instagramEmbed, isXGif, metaOgImage, newsBodyImages, PLACEHOLDER_MIN_ARTICLES, retryDelayMs, videoFrameUrls, xPostImages, youtubeImages, type OcrLine } from "@/lib/mediaVisual";
import { metaPost } from "@/lib/media/metaPost";
import { backfillProjects, cleanupOldMedia, ensureMediaIndexes, tagItems } from "./projects";
import { groupUngrouped, twinGroupFor } from "./twins";
import { applyTextSignals, applyTranscript, computeKeyText, refreshTextSignals } from "./textSignals";

const SERVICE = () => process.env.MEDIA_SERVICE_URL ?? "http://127.0.0.1:3726";
/** Speech-to-text service (scripts/media/layanan_asr.py); optional: without it videos simply wait. */
const ASR = () => process.env.MEDIA_ASR_URL ?? "http://127.0.0.1:3727";
/** Transcription time per tick, and how old a video may be when its turn comes (Instagram video links expire in days). */
const ASR_BUDGET_MS = Number(process.env.MEDIA_ASR_BUDGET_MS ?? 120_000);
const ASR_MAX_AGE_DAYS = 3;
/** First run: start this far back (images of older items have often expired). */
const LOOKBACK_HOURS = Number(process.env.MEDIA_LOOKBACK_HOURS ?? 24);
/** Items read per feed per tick. */
const COLLECT_BATCH = 300;
/** Backlog read per tick for feeds without outside calls (news, YouTube): ±1 hour of news is 300 items, so a day of
 *  backlog would take a day of ticks at COLLECT_BATCH. X stays at COLLECT_BATCH (FxTwitter pace). */
const BACK_BATCH = Number(process.env.MEDIA_BACK_BATCH ?? 1500);
/** X: ask FxTwitter only for posts linking t.co (68% of media posts in a sample, a quarter of the requests); MEDIA_X_ALL=1 asks for every post. */
const X_ALL = process.env.MEDIA_X_ALL === "1";
/** Pause between FxTwitter requests, to stay well below its rate limits. */
const X_GAP_MS = 400;
/** Instagram/Threads: one post page per second, and at most this many per read (±2,800 and ±1,700 posts a day). */
const META_GAP_MS = 1000;
const META_BATCH = 60;
/** Bytes of a post page read for its og:image (it sits in the first ±12 KB of a ±600 KB page), and of an Instagram embed
 *  page for its media data (±230 KB into a ±300 KB page). */
const META_HEAD_BYTES = 128 * 1024;
const EMBED_BYTES = 640 * 1024;
/** Honest client name, like the analysis service's image downloads. */
const MEDIA_UA = "Mozilla/5.0 (compatible; signalbase-media/1.0)";
/** Images read from the queue at once; batches repeat until the tick's analysis time is used up. */
const ANALYZE_BATCH = Number(process.env.MEDIA_ANALYZE_BATCH ?? 120);
/** Analysis time per tick: long enough that collecting (±90 s, mostly X) is a small part, short enough that new posts are
 *  collected every few minutes. */
const ANALYZE_BUDGET_MS = Number(process.env.MEDIA_ANALYZE_BUDGET_MS ?? 180_000);
const MAX_ATTEMPTS = 3;
/** Images sent to the service at once; match its MEDIA_PARALLEL (one engine each). */
const PARALLEL = Math.max(1, Number(process.env.MEDIA_PARALLEL ?? 2));

/** `context`: the item's caption or headline, so OCR text that only repeats it is left out of the key text. */
/** `video`: the video whose poster is `urls[0]`, for transcription. */
type Found = { type: "social" | "online"; code: string; source: string; publishedAt: Date; kind: string; urls: string[]; context: string | null; video?: string | null };
type Collected = { found: Found[]; save: () => Promise<void> };
/** `save(upTo)`: move the cursor to `upTo` (null: leave it), by default past every row read. */
type Save = (upTo?: Row | null) => Promise<void>;
type Row = { code: string; source: string; ts: string; at: Date; image?: string | null; url?: string | null; content?: string | null; title?: string | null; body?: string[] | null };

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function cursorOf(name: string) {
  const c = await prisma.mediaCursor.findUnique({ where: { name } });
  if (c) return c;
  const { rows } = await bankPool().query<{ ts: string }>(`SELECT to_char(now() - ($1 || ' hours')::interval, 'YYYY-MM-DD"T"HH24:MI:SS.US') ts`, [LOOKBACK_HOURS]);
  return { ts: rows[0].ts, code: "" };
}

type Feed = { rows: Row[]; save: Save };
const saveCursor = (name: string, last?: Row): Save => async (upTo) => {
  const at = upTo === undefined ? last : upTo;
  if (at) await prisma.mediaCursor.upsert({ where: { name }, create: { name, ts: at.ts, code: at.code }, update: { ts: at.ts, code: at.code } });
};

/** Two reads per feed, so the newest days fill first.
 *  Head (`<feed>:head`): items after the head, oldest first (all new posts; the first run starts at the newest batch).
 *  Back (`<feed>:back`): the gap between the feed's old cursor (`<feed>`, where collecting started) and the head, read
 *  newest first, so a backlog fills from today backwards; it stops once it reaches the old cursor. */
async function newer(name: string, sql: (cond: string, order: string, limit: number) => string, backLimit = COLLECT_BATCH, headLimit = COLLECT_BATCH): Promise<Feed[]> {
  const [head, back] = await Promise.all([prisma.mediaCursor.findUnique({ where: { name: `${name}:head` } }), prisma.mediaCursor.findUnique({ where: { name: `${name}:back` } })]);
  if (!head) {
    const { rows } = await bankPool().query<Row>(sql("true", "at DESC, code DESC", headLimit));
    return [{ rows, save: saveCursor(`${name}:head`, rows[0]) }];
  }
  const h = await bankPool().query<Row>(sql(`(at, code) > ($1::timestamp, $2)`, "at, code", headLimit), [head.ts, head.code]);
  const floor = await cursorOf(name);
  const top = back ?? head;
  const b = await bankPool().query<Row>(sql(`(at, code) > ($1::timestamp, $2) AND (at, code) < ($3::timestamp, $4)`, "at DESC, code DESC", backLimit), [floor.ts, floor.code, top.ts, top.code]);
  return [
    { rows: h.rows, save: saveCursor(`${name}:head`, h.rows.at(-1)) },
    // Nothing left between the old cursor and the back cursor: the backlog is done and this read returns nothing.
    { rows: b.rows, save: saveCursor(`${name}:back`, b.rows.at(-1)) },
  ];
}

const TS = (col: string) => `to_char(${col}, 'YYYY-MM-DD"T"HH24:MI:SS.US')`;

async function collectNews(): Promise<Collected[]> {
  const feeds = await newer("news", (cond, order, limit) => `SELECT * FROM (
      SELECT n.news_code code, n.news_source source, ${TS("n.news_timestamp")} ts, n.news_timestamp at, n.news_image image,
             left(concat_ws(' ', n.news_title, n.news_preview), 1000) title,
             CASE WHEN n.news_content ~* '<img' THEN ARRAY(SELECT m[1] FROM regexp_matches(n.news_content, '<img\\s[^>]*?src=["'']?(https?://[^"''\\s>]+)', 'gi') m LIMIT 12) END body
      FROM news_main n WHERE n.news_timestamp <= now() AND (n.news_image ~ '^https?://' OR n.news_content ~* '<img')
    ) t WHERE ${cond} ORDER BY ${order} LIMIT ${limit}`, BACK_BATCH);
  return feeds.map(({ rows, save }) => ({
    save,
    found: rows.flatMap((r): Found[] => {
      const lead = r.image && /^https?:\/\//.test(r.image) ? r.image : null;
      const urls = [...(lead ? [lead] : []), ...newsBodyImages(r.body, lead)];
      return urls.length ? [{ type: "online", code: r.code, source: r.source, publishedAt: r.at, kind: "news", urls, context: r.title ?? null }] : [];
    }),
  }));
}

async function collectSocial(name: string, source: string, backLimit?: number, headLimit?: number) {
  return newer(name, (cond, order, limit) => `SELECT * FROM (
      SELECT p.post_code code, p.post_source source, ${TS("p.post_timestamps")} ts, p.post_timestamps at, p.post_url url, left(p.post_content, 2000) content
      FROM post_main p WHERE p.post_source = '${source}' AND p.post_timestamps <= now()
    ) t WHERE ${cond} ORDER BY ${order} LIMIT ${limit}`, backLimit, headLimit);
}

async function collectYoutube(): Promise<Collected[]> {
  return (await collectSocial("youtube", "youtube", BACK_BATCH)).map(({ rows, save }) => ({
    save,
    found: rows.flatMap((r): Found[] => {
      const urls = youtubeImages(r.url);
      return urls.length ? [{ type: "social", code: r.code, source: "youtube", publishedAt: r.at, kind: "youtube", urls, context: r.content ?? null }] : [];
    }),
  }));
}

async function collectX(): Promise<Collected[]> {
  const out: Collected[] = [];
  for (const { rows, save } of await collectSocial("x", "twitter")) out.push({ save, found: await xImages(rows) }); // one after the other: FxTwitter pace
  return out;
}

/** Instagram/Threads: the image of each post's public page. A page that asks to log in or a rate limit stops the read;
 *  the cursor then stays at the last post read, so the rest is tried next tick. */
async function collectMeta(name: "instagram" | "threads"): Promise<Collected[]> {
  const out: Collected[] = [];
  for (const { rows, save } of await collectSocial(name, name, META_BATCH, META_BATCH)) {
    const known = new Set((await prisma.mediaLink.findMany({ where: { type: "social", code: { in: rows.map((r) => r.code) } }, select: { code: true } })).map((l) => l.code));
    const found: Found[] = [];
    let last: Row | null = null;
    for (const r of rows) {
      if (!known.has(r.code) && r.url) {
        const media = await postMedia(name, r.url);
        if (media === "blocked") break;
        if (media?.images.length) {
          const urls = media.video ? [media.images[0], ...videoFrameUrls(media.video), ...media.images.slice(1)] : media.images;
          found.push({ type: "social", code: r.code, source: name, publishedAt: r.at, kind: name, urls, context: r.content ?? null, video: media.video });
        }
      }
      last = r;
    }
    out.push({ found, save: () => save(last) });
  }
  return out;
}

/** Images (and a Reel's video) of an Instagram/Threads post. Instagram: the official embed page (every carousel slide);
 *  when it carries no data, and for Threads, the og:image of the post page. One page per META_GAP_MS. */
async function postMedia(name: "instagram" | "threads", url: string): Promise<{ images: string[]; video: string | null } | "blocked" | null> {
  const post = name === "instagram" ? metaPost(url) : null;
  if (post?.platform === "instagram") {
    const embed = await readPage(`${post.url}embed/captioned/`, EMBED_BYTES, (html) => html.includes('"contextJSON":null') || !!instagramEmbed(html));
    await sleep(META_GAP_MS);
    if (embed === "blocked") return embed;
    const media = embed && instagramEmbed(embed);
    if (media) return media;
  }
  const page = await readPage(url, META_HEAD_BYTES, (html) => /og:image[^>]*>/.test(html));
  await sleep(META_GAP_MS);
  if (page === "blocked") return page;
  if (!page) return null;
  const image = metaOgImage(page);
  return image ? { images: [image], video: null } : null;
}

/** The start of a public Instagram/Threads page, read until `enough` or `maxBytes`; "blocked" when it asks to log in or
 *  limits us, null on other errors. */
async function readPage(url: string, maxBytes: number, enough: (html: string) => boolean): Promise<string | "blocked" | null> {
  const host = new URL(url).hostname;
  if (!/(^|\.)(instagram|threads)\.(com|net)$/.test(host)) return null;
  try {
    const res = await fetch(url, { headers: { "User-Agent": MEDIA_UA }, signal: AbortSignal.timeout(15_000), cache: "no-store" });
    if (res.status === 429 || /\/(accounts\/)?login/.test(new URL(res.url).pathname)) { await res.body?.cancel(); return "blocked"; }
    if (!res.ok || !res.body) { await res.body?.cancel(); return null; }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let html = "";
    while (html.length < maxBytes && !enough(html)) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
    }
    await reader.cancel().catch(() => {});
    return html;
  } catch {
    return null;
  }
}

/** X posts' images through FxTwitter; posts already collected (by the other cursor) are not asked again. */
async function xImages(rows: Row[]) {
  const known = new Set((await prisma.mediaLink.findMany({ where: { type: "social", code: { in: rows.map((r) => r.code) } }, select: { code: true } })).map((l) => l.code));
  const found: Found[] = [];
  for (const r of rows) {
    if (known.has(r.code) || (!X_ALL && !r.content?.includes("t.co/"))) continue;
    const id = xPostId(r.url);
    if (!id) continue;
    try {
      const post = await originalXPost(id);
      const media = post?.media ?? [];
      const images = xPostImages(media);
      // A video's poster first (its speech is transcribed), then frames of it; GIFs only their poster.
      const video = media.find((m) => m.kind === "video" && !isXGif(m.url));
      const urls = video?.poster ? [video.poster, ...images.filter((u) => u !== video.poster), ...videoFrameUrls(video.url)] : images;
      if (urls.length) found.push({ type: "social", code: r.code, source: "twitter", publishedAt: r.at, kind: media.some((m) => m.kind === "video") ? "x_video" : "x_photo", urls, context: post!.text || r.content || null, video: video?.poster ? video.url : null });
    } catch { /* FxTwitter/X unavailable: this post is skipped, the feed moves on */ }
    await sleep(X_GAP_MS);
  }
  return found;
}

async function store(found: Found[]) {
  const newsAssets = new Set<string>();
  for (const f of found) {
    for (const [position, url] of f.urls.entries()) {
      if (url.length > 2000) continue;
      const video = position === 0 && f.video && f.video.length <= 2000 ? f.video : null;
      const asset = await prisma.mediaAsset.upsert({
        where: { urlHash: sha(url) },
        create: { urlHash: sha(url), url, kind: f.kind, context: f.context?.slice(0, 1000) ?? null, ...(video ? { videoUrl: video, transcriptStatus: "pending" } : {}) },
        update: {}, select: { id: true, videoUrl: true },
      });
      if (video && !asset.videoUrl) await prisma.mediaAsset.update({ where: { id: asset.id }, data: { videoUrl: video, transcriptStatus: "pending" } });
      await prisma.mediaLink.upsert({
        where: { type_code_position: { type: f.type, code: f.code, position } },
        create: { type: f.type, code: f.code, position, assetId: asset.id, source: f.source, publishedAt: f.publishedAt },
        update: { assetId: asset.id },
      });
      if (f.type === "online") newsAssets.add(asset.id);
    }
  }
  // An outlet's default picture (same image on many of its articles) says nothing about the article: hidden from the page.
  if (newsAssets.size) await prisma.$executeRaw`UPDATE "MediaAsset" SET placeholder = true WHERE NOT placeholder AND id IN (
    SELECT "assetId" FROM "MediaLink" WHERE type = 'online' AND "assetId" = ANY(${[...newsAssets]})
    GROUP BY "assetId", source HAVING count(DISTINCT code) >= ${PLACEHOLDER_MIN_ARTICLES})`;
}

type Analysis = { width: number; height: number; dhash: string; tags: { tag: string; score: number }[]; sensitive: string[]; ocrText: string; ocrWords: number; ocrLines?: OcrLine[]; unreadText?: boolean; model: string };

/** Analyses waiting images: those of the newest posts first (per day), social media before news within a day (richer in
 *  text); failed ones after their pause. */
async function analyzePending() {
  const pending = await prisma.$queryRaw<{ id: string; url: string; attempts: number; context: string | null }[]>`
    SELECT id, url, attempts, context FROM "MediaAsset" a
    WHERE (status = 'pending' OR (status = 'failed' AND attempts < ${MAX_ATTEMPTS})) AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= now())
    ORDER BY date_trunc('day', (SELECT max(l."publishedAt") FROM "MediaLink" l WHERE l."assetId" = a.id)) DESC NULLS LAST, CASE kind WHEN 'x_photo' THEN 0 WHEN 'instagram' THEN 1 WHEN 'threads' THEN 1 WHEN 'x_video' THEN 2 WHEN 'youtube' THEN 3 ELSE 4 END, "createdAt" DESC
    LIMIT ${ANALYZE_BATCH}`;
  const failed = (a: { attempts: number }) => {
    const wait = retryDelayMs(a.attempts + 1);
    return { attempts: a.attempts + 1, nextAttemptAt: wait === null ? null : new Date(Date.now() + wait) };
  };
  let done = 0;
  let stop = false;
  serviceOk = true;
  // Analyses run PARALLEL at a time; storing a result runs one at a time (twin groups are matched in this process's memory).
  let storing = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>) => { const p = storing.then(fn); storing = p.then(() => {}, () => {}); return p; };
  const queue = [...pending];
  const analyzeOne = async (a: (typeof pending)[number]) => {
    try {
      const res = await fetch(`${SERVICE()}/analyze`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: a.url }), signal: AbortSignal.timeout(90_000),
      });
      const body = await res.json() as Analysis & { error?: string; gone?: boolean };
      if (!res.ok) {
        await prisma.mediaAsset.update({ where: { id: a.id }, data: { status: body.gone ? "gone" : "failed", error: body.error?.slice(0, 300) ?? `HTTP ${res.status}`, ...failed(a) } });
        return;
      }
      await serial(() => saveAnalysis(a, body));
      done++;
    } catch (e) {
      // The service itself is down or slow: stop this tick, nothing is marked failed.
      if (e instanceof TypeError || (e as Error).name === "TimeoutError") {
        stop = true;
        serviceOk = false;
        lastError = `Layanan analisis tidak menjawab: ${(e as Error).message}`;
        console.warn(`[media] ${lastError}`);
        return;
      }
      await prisma.mediaAsset.update({ where: { id: a.id }, data: { status: "failed", error: String(e).slice(0, 300), ...failed(a) } });
    }
  };
  const lane = async () => {
    for (let a = queue.shift(); a && !stop; a = queue.shift()) await analyzeOne(a);
  };
  await Promise.all(Array.from({ length: PARALLEL }, lane));
  return done;
}

async function saveAnalysis(a: { id: string; attempts: number; context: string | null }, body: Analysis) {
  const key = computeKeyText(body.ocrLines ?? [], a.context);
  await prisma.mediaAsset.update({
    where: { id: a.id },
    data: {
      ocrLines: body.ocrLines ?? [], unreadText: body.unreadText ?? false, keyText: key.text, keyWords: key.words,
      status: "done", error: null, attempts: a.attempts + 1, nextAttemptAt: null, width: body.width, height: body.height, dhash: body.dhash,
      ocrText: body.ocrText.slice(0, 5000), ocrWords: body.ocrWords, tags: body.tags, tagList: body.tags.map((t) => t.tag),
      sensitive: body.sensitive, model: body.model, analyzedAt: new Date(), twinGroup: body.dhash ? await twinGroupFor(a.id, body.dhash) : null,
    },
  });
  // Calls to action, narrative, numeric claims, and the projects whose keywords appear in the image.
  await applyTextSignals(a.id, key.text).catch((e) => console.warn(`[media] sinyal teks gagal: ${(e as Error).message}`));
}

let serviceOk = true;
let lastError: string | null = null;

/** One pass: collect every feed, then analyse. Returns counts for the log. Writes the worker's heartbeat (MediaWorkerState). */
export async function runMediaTick() {
  const started = Date.now();
  lastError = null;
  const collected: Record<string, number> = {};
  for (const [name, collect] of [["news", collectNews], ["x", collectX], ["youtube", collectYoutube], ["instagram", () => collectMeta("instagram")], ["threads", () => collectMeta("threads")]] as const) {
    try {
      collected[name] = 0;
      for (const { found, save } of await collect()) {
        await store(found);
        await tagItems(found.map((f) => ({ type: f.type, code: f.code })));
        await save();
        collected[name] += found.length;
      }
    } catch (e) {
      lastError = `${name}: ${(e as Error).message}`.slice(0, 300);
      console.error(`[media] ${name} gagal:`, (e as Error).message);
    }
  }
  const backfilled = await backfillProjects().catch((e) => { console.error("[media] backfill proyek gagal:", (e as Error).message); return 0; });
  let analyzed = 0;
  for (const until = Date.now() + ANALYZE_BUDGET_MS; Date.now() < until;) {
    const n = await analyzePending();
    analyzed += n;
    if (!n || !serviceOk) break;
  }
  const transcribed = await transcribePending().catch((e) => { console.error("[media] transkripsi gagal:", (e as Error).message); return 0; });
  const rederived = await refreshTextSignals().catch((e) => { console.error("[media] sinyal teks lama gagal:", (e as Error).message); return 0; });
  if (rederived) console.log(`[media] ${rederived} gambar lama diperbarui sinyal teksnya`);
  const lastTick = { collected, backfilled, analyzed, transcribed, ms: Date.now() - started };
  await prisma.mediaWorkerState.upsert({
    where: { id: "main" }, create: { id: "main", heartbeatAt: new Date(), serviceOk, lastError, lastTick },
    update: { heartbeatAt: new Date(), serviceOk, lastError, lastTick },
  }).catch(() => {});
  return { collected, backfilled, analyzed, transcribed };
}

type Transcript = { text: string; language: string | null; audio: boolean; error?: string; gone?: boolean };
let asrDown = false;

/** Transcribes the speech of waiting videos, newest posts first, for ASR_BUDGET_MS. Videos older than ASR_MAX_AGE_DAYS
 *  when their turn comes are skipped ("none"). Without the service (not installed, or down) nothing changes. */
async function transcribePending() {
  await prisma.$executeRaw`UPDATE "MediaAsset" SET "transcriptStatus" = 'none' WHERE "transcriptStatus" = 'pending' AND "createdAt" < now() - make_interval(days => ${ASR_MAX_AGE_DAYS})`;
  let done = 0;
  for (const until = Date.now() + ASR_BUDGET_MS; Date.now() < until;) {
    const [a] = await prisma.$queryRaw<{ id: string; videoUrl: string }[]>`
      SELECT id, "videoUrl" FROM "MediaAsset" a WHERE "transcriptStatus" = 'pending' AND "videoUrl" IS NOT NULL
      ORDER BY (SELECT max(l."publishedAt") FROM "MediaLink" l WHERE l."assetId" = a.id) DESC NULLS LAST, "createdAt" DESC LIMIT 1`;
    if (!a) break;
    let res: Response;
    try {
      res = await fetch(`${ASR()}/transcribe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: a.videoUrl }), signal: AbortSignal.timeout(300_000) });
    } catch (e) {
      if (!asrDown) console.warn(`[media] layanan transkripsi tidak menjawab: ${(e as Error).message}`);
      asrDown = true;
      break;
    }
    asrDown = false;
    const body = await res.json().catch(() => ({})) as Transcript;
    if (!res.ok) {
      // A removed video ("gone") or a decoding error: not retried.
      await prisma.mediaAsset.update({ where: { id: a.id }, data: { transcriptStatus: "failed", transcriptAt: new Date(), transcript: null } });
      if (!body.gone) console.warn(`[media] transkripsi ${a.id} gagal: ${body.error ?? res.status}`);
      continue;
    }
    const text = body.text?.trim().slice(0, 5000) ?? "";
    await prisma.mediaAsset.update({
      where: { id: a.id },
      data: { transcriptStatus: body.audio ? "done" : "none", transcript: text, transcriptLang: body.language, transcriptAt: new Date() },
    });
    if (text) await applyTranscript(a.id, text).catch((e) => console.warn(`[media] proyek dari transkrip gagal: ${(e as Error).message}`));
    done++;
  }
  return done;
}

let lastCleanup = 0;
/** Once per process start: indexes; then at most once a day: media past the retention period. */
export async function mediaHousekeeping() {
  if (!lastCleanup) {
    await ensureMediaIndexes();
    const grouped = await groupUngrouped();
    if (grouped) console.log(`[media] ${grouped} gambar lama dikelompokkan (gambar mirip)`);
  }
  if (Date.now() - lastCleanup < 86_400_000) return null;
  lastCleanup = Date.now();
  return cleanupOldMedia();
}
