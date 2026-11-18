// Local media analysis (npm run media): collects the images of new items from the source database (read-only) and has the
// local service (scripts/media/layanan_media.py, MEDIA_SERVICE_URL) read their text (OCR), tag them and fingerprint them.
// Feeds: news images (news_main.news_image), X photos and video thumbnails (through originalXPost), YouTube thumbnails.
// Instagram, Facebook, Threads and TikTok are not collected: their files are not available to Signalbase.
//
// Each tick: collect per feed the newest items (head cursor) and the next older ones (tail cursor, catching up from the
// first run), then analyse pending images, newest posts first. Nothing
// is stored but the URL and the results; one image used by many items is analysed once (MediaAsset.urlHash).
import { createHash } from "node:crypto";
import { prisma } from "../db";
import { bankPool } from "../bank/pool";
import { originalXPost } from "../xPost";
import { xPostId } from "@/lib/media/xPost";
import { PLACEHOLDER_MIN_ARTICLES, retryDelayMs, xPostImages, youtubeThumbnail, type OcrLine } from "@/lib/mediaVisual";
import { backfillProjects, cleanupOldMedia, ensureMediaIndexes, tagItems } from "./projects";
import { groupUngrouped, twinGroupFor } from "./twins";
import { applyTextSignals, computeKeyText, refreshTextSignals } from "./textSignals";

const SERVICE = () => process.env.MEDIA_SERVICE_URL ?? "http://127.0.0.1:3726";
/** First run: start this far back (images of older items have often expired). */
const LOOKBACK_HOURS = Number(process.env.MEDIA_LOOKBACK_HOURS ?? 24);
/** Items read per feed per tick. */
const COLLECT_BATCH = 300;
/** X: ask FxTwitter only for posts linking t.co (68% of media posts in a sample, a quarter of the requests); MEDIA_X_ALL=1 asks for every post. */
const X_ALL = process.env.MEDIA_X_ALL === "1";
/** Pause between FxTwitter requests, to stay well below its rate limits. */
const X_GAP_MS = 400;
/** Images analysed per tick (the service does one at a time). */
const ANALYZE_BATCH = Number(process.env.MEDIA_ANALYZE_BATCH ?? 120);
const MAX_ATTEMPTS = 3;

/** `context`: the item's caption or headline, so OCR text that only repeats it is left out of the key text. */
type Found = { type: "social" | "online"; code: string; source: string; publishedAt: Date; kind: string; urls: string[]; context: string | null };
type Collected = { found: Found[]; save: () => Promise<void> };
type Row = { code: string; source: string; ts: string; at: Date; image?: string | null; url?: string | null; content?: string | null; title?: string | null };

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function cursorOf(name: string) {
  const c = await prisma.mediaCursor.findUnique({ where: { name } });
  if (c) return c;
  const { rows } = await bankPool().query<{ ts: string }>(`SELECT to_char(now() - ($1 || ' hours')::interval, 'YYYY-MM-DD"T"HH24:MI:SS.US') ts`, [LOOKBACK_HOURS]);
  return { ts: rows[0].ts, code: "" };
}

type Feed = { rows: Row[]; save: () => Promise<void> };
const saveCursor = (name: string, at?: Row) => async () => {
  if (at) await prisma.mediaCursor.upsert({ where: { name }, create: { name, ts: at.ts, code: at.code }, update: { ts: at.ts, code: at.code } });
};

/** Two reads per feed. Head: the newest items since the last head (newest first), so new posts show up within a tick
 *  even while a backlog is being worked off. Tail: items after the feed's cursor (oldest first, the cursor only moves
 *  forward) up to the head, which fills what the head skipped when more than a batch arrived between ticks. */
async function newer(name: string, sql: (cond: string, order: string) => string): Promise<Feed[]> {
  const head = await prisma.mediaCursor.findUnique({ where: { name: `${name}:head` } });
  const h = head
    ? await bankPool().query<Row>(sql(`(at, code) > ($1::timestamp, $2)`, "at DESC, code DESC"), [head.ts, head.code])
    : await bankPool().query<Row>(sql("true", "at DESC, code DESC"));
  const c = await cursorOf(name);
  const top = head ?? (h.rows[0] ? { ts: h.rows[0].ts, code: h.rows[0].code } : null);
  const t = top
    ? await bankPool().query<Row>(sql(`(at, code) > ($1::timestamp, $2) AND (at, code) <= ($3::timestamp, $4)`, "at, code"), [c.ts, c.code, top.ts, top.code])
    : await bankPool().query<Row>(sql(`(at, code) > ($1::timestamp, $2)`, "at, code"), [c.ts, c.code]);
  return [{ rows: h.rows, save: saveCursor(`${name}:head`, h.rows[0]) }, { rows: t.rows, save: saveCursor(name, t.rows.at(-1)) }];
}

const TS = (col: string) => `to_char(${col}, 'YYYY-MM-DD"T"HH24:MI:SS.US')`;

async function collectNews(): Promise<Collected[]> {
  const feeds = await newer("news", (cond, order) => `SELECT * FROM (
      SELECT n.news_code code, n.news_source source, ${TS("n.news_timestamp")} ts, n.news_timestamp at, n.news_image image,
             left(concat_ws(' ', n.news_title, n.news_preview), 1000) title
      FROM news_main n WHERE n.news_timestamp <= now() AND n.news_image ~ '^https?://'
    ) t WHERE ${cond} ORDER BY ${order} LIMIT ${COLLECT_BATCH}`);
  return feeds.map(({ rows, save }) => ({ save, found: rows.map((r): Found => ({ type: "online", code: r.code, source: r.source, publishedAt: r.at, kind: "news", urls: [r.image!], context: r.title ?? null })) }));
}

async function collectSocial(name: "x" | "youtube", source: string) {
  return newer(name, (cond, order) => `SELECT * FROM (
      SELECT p.post_code code, p.post_source source, ${TS("p.post_timestamps")} ts, p.post_timestamps at, p.post_url url, left(p.post_content, 2000) content
      FROM post_main p WHERE p.post_source = '${source}' AND p.post_timestamps <= now()
    ) t WHERE ${cond} ORDER BY ${order} LIMIT ${COLLECT_BATCH}`);
}

async function collectYoutube(): Promise<Collected[]> {
  return (await collectSocial("youtube", "youtube")).map(({ rows, save }) => ({
    save,
    found: rows.flatMap((r): Found[] => {
      const thumb = youtubeThumbnail(r.url);
      return thumb ? [{ type: "social", code: r.code, source: "youtube", publishedAt: r.at, kind: "youtube", urls: [thumb], context: r.content ?? null }] : [];
    }),
  }));
}

async function collectX(): Promise<Collected[]> {
  const out: Collected[] = [];
  for (const { rows, save } of await collectSocial("x", "twitter")) out.push({ save, found: await xImages(rows) }); // one after the other: FxTwitter pace
  return out;
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
      const images = xPostImages(post?.media ?? []);
      if (images.length) found.push({ type: "social", code: r.code, source: "twitter", publishedAt: r.at, kind: post!.media.some((m) => m.kind === "video") ? "x_video" : "x_photo", urls: images, context: post!.text || r.content || null });
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
      const asset = await prisma.mediaAsset.upsert({ where: { urlHash: sha(url) }, create: { urlHash: sha(url), url, kind: f.kind, context: f.context?.slice(0, 1000) ?? null }, update: {}, select: { id: true } });
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
    ORDER BY date_trunc('day', (SELECT max(l."publishedAt") FROM "MediaLink" l WHERE l."assetId" = a.id)) DESC NULLS LAST, CASE kind WHEN 'x_photo' THEN 0 WHEN 'x_video' THEN 1 WHEN 'youtube' THEN 2 ELSE 3 END, "createdAt" DESC
    LIMIT ${ANALYZE_BATCH}`;
  const failed = (a: { attempts: number }) => {
    const wait = retryDelayMs(a.attempts + 1);
    return { attempts: a.attempts + 1, nextAttemptAt: wait === null ? null : new Date(Date.now() + wait) };
  };
  let done = 0;
  serviceOk = true;
  for (const a of pending) {
    try {
      const res = await fetch(`${SERVICE()}/analyze`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: a.url }), signal: AbortSignal.timeout(90_000),
      });
      const body = await res.json() as Analysis & { error?: string; gone?: boolean };
      if (!res.ok) {
        await prisma.mediaAsset.update({ where: { id: a.id }, data: { status: body.gone ? "gone" : "failed", error: body.error?.slice(0, 300) ?? `HTTP ${res.status}`, ...failed(a) } });
        continue;
      }
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
      done++;
    } catch (e) {
      // The service itself is down or slow: stop this tick, nothing is marked failed.
      if (e instanceof TypeError || (e as Error).name === "TimeoutError") {
        serviceOk = false;
        lastError = `Layanan analisis tidak menjawab: ${(e as Error).message}`;
        console.warn(`[media] ${lastError}`);
        break;
      }
      await prisma.mediaAsset.update({ where: { id: a.id }, data: { status: "failed", error: String(e).slice(0, 300), ...failed(a) } });
    }
  }
  return done;
}

let serviceOk = true;
let lastError: string | null = null;

/** One pass: collect every feed, then analyse. Returns counts for the log. Writes the worker's heartbeat (MediaWorkerState). */
export async function runMediaTick() {
  const started = Date.now();
  lastError = null;
  const collected: Record<string, number> = {};
  for (const [name, collect] of [["news", collectNews], ["x", collectX], ["youtube", collectYoutube]] as const) {
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
  const analyzed = await analyzePending();
  const rederived = await refreshTextSignals().catch((e) => { console.error("[media] sinyal teks lama gagal:", (e as Error).message); return 0; });
  if (rederived) console.log(`[media] ${rederived} gambar lama diperbarui sinyal teksnya`);
  const lastTick = { collected, backfilled, analyzed, ms: Date.now() - started };
  await prisma.mediaWorkerState.upsert({
    where: { id: "main" }, create: { id: "main", heartbeatAt: new Date(), serviceOk, lastError, lastTick },
    update: { heartbeatAt: new Date(), serviceOk, lastError, lastTick },
  }).catch(() => {});
  return { collected, backfilled, analyzed };
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
