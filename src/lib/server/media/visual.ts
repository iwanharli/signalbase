// Media visual page: analysed images from the Signalbase database (MediaAsset / MediaLink, filled by the media worker),
// optionally one project's (MediaLink.keys, tagged by the worker; no source-database query per request).
// Two views: per post (default; a post's images together, text and tags merged) and per image (follow one picture).
import { Prisma } from "@prisma/client";
import type { MediaItem, MediaType } from "@/lib/media/types";
import {
  formatVisualCursor, mergeKeyText, mergeTags, NARRATIVE_MIN_POSTS, VISUAL_PAGE_SIZE,
  type VisualAsset, type VisualCursor, type VisualKind, type VisualPost, type VisualResponse, type VisualTwin, type VisualView, type VisualWorker,
} from "@/lib/mediaVisual";
import { fetchItemsByCode } from "../bank";
import { sharedCache } from "../bank/cache";
import { prisma } from "../db";
import { projectReady } from "./projects";

export type VisualQuery = {
  view: VisualView; days: number; kind: VisualKind | null; tag: string | null; sensitive: boolean; text: boolean; q: string; after: VisualCursor | null;
  /** Calls to action only; numeric claims only; one shared narrative (its key). */
  action: boolean; claims: boolean; narrative: string | null;
  /** Text in a script the OCR can't read (Arabic, Cyrillic, Chinese…). */
  unread: boolean;
};
type Page = Omit<VisualResponse, "days" | "worker">;

const USES_SHOWN = 3;
const TYPE_OF: Record<VisualKind, MediaType> = { news: "online", x_photo: "social", x_video: "social", youtube: "social" };

// The page re-asks while someone scrolls or changes a filter; a minute is fresh enough for media that arrive every few minutes.
const cache = sharedCache<Page>("media.visual", { ttlMs: 60_000, maxEntries: 300, staleWhileRevalidate: true });
// The summary depends only on period, kind and project, not on tag/text/search/page/view: shared by every combination.
type Summary = Omit<VisualResponse["stats"], "pending" | "syncing">;
const summaryCache = sharedCache<Summary>("media.visual.summary", { ttlMs: 2 * 60_000, maxEntries: 100, staleWhileRevalidate: true });

export function visualPage(query: VisualQuery, keyId: string | null) {
  return cache(JSON.stringify([query, keyId]), () => load(query, keyId));
}

export async function workerStatus(): Promise<VisualWorker> {
  const w = await prisma.mediaWorkerState.findUnique({ where: { id: "main" } });
  return w ? { heartbeatAt: w.heartbeatAt.toISOString(), serviceOk: w.serviceOk, lastError: w.lastError, lastTick: (w.lastTick as { analyzed: number; ms: number } | null) ?? null } : null;
}

const where = (parts: Prisma.Sql[]) => Prisma.join(parts, " AND ");

/** SQL conditions: on the link (period, project), on the image (shown at all) and the filters an image must match. */
function conditions(query: VisualQuery, keyId: string | null) {
  const since = new Date(Date.now() - query.days * 86_400_000);
  // publishedAt is a timestamp without zone holding UTC (Prisma); a Date parameter in raw SQL is converted with the
  // session time zone, so the bound is sent as UTC text.
  const link = [Prisma.sql`l."publishedAt" >= ${since.toISOString().slice(0, 23)}::timestamp`];
  if (keyId) link.push(Prisma.sql`${keyId} = ANY(l.keys)`);
  // An outlet's default picture says nothing about the article (MediaAsset.placeholder).
  const shown = [Prisma.sql`a.status = 'done'`, Prisma.sql`NOT a.placeholder`];
  if (query.kind) shown.push(Prisma.sql`a.kind = ${query.kind}`);
  const match: Prisma.Sql[] = [];
  if (query.tag) match.push(Prisma.sql`${query.tag} = ANY(a."tagList")`);
  if (query.sensitive) match.push(Prisma.sql`cardinality(a.sensitive) > 0`);
  // "Ada teks" and the search use the key text: app chrome, camera stamps and caption repeats left out.
  if (query.text) match.push(Prisma.sql`a."keyWords" > 0`);
  if (query.q) match.push(Prisma.sql`a."keyText" ILIKE ${`%${query.q.replace(/[%_\\]/g, "\\$&")}%`}`);
  if (query.action) match.push(Prisma.sql`a."actionCall" IS NOT NULL`);
  if (query.unread) match.push(Prisma.sql`a."unreadText"`);
  if (query.claims) match.push(Prisma.sql`cardinality(a.claims) > 0`);
  if (query.narrative) match.push(Prisma.sql`a.narrative = ${query.narrative}`);
  return { link, shown, match };
}

async function load(query: VisualQuery, keyId: string | null): Promise<Page> {
  const cond = conditions(query, keyId);
  const [page, summary, pending, syncing] = await Promise.all([
    query.view === "narrative" ? narrativePage(cond) : query.view === "post" ? postPage(query, cond) : imagePage(query, cond),
    summaryCache(JSON.stringify([query.days, query.kind, keyId]), async () => {
      // One pass over the distinct images of the period, then counts and tags from that set.
      const [row] = await prisma.$queryRaw<(Summary & { tags: Summary["tags"] | null })[]>`
        WITH ids AS (SELECT DISTINCT l."assetId" id FROM "MediaLink" l WHERE ${where(cond.link)}),
             a AS (SELECT a."keyWords", a.sensitive, a."tagList" FROM "MediaAsset" a JOIN ids ON ids.id = a.id WHERE ${where(cond.shown)})
        SELECT (SELECT count(*)::int FROM a) total, (SELECT count(*)::int FROM a WHERE "keyWords" > 0) "withText",
               (SELECT count(*)::int FROM a WHERE cardinality(sensitive) > 0) sensitive,
               (SELECT json_agg(t ORDER BY t.n DESC) FROM (SELECT tag, count(*)::int n FROM a, unnest("tagList") tag GROUP BY tag ORDER BY n DESC LIMIT 12) t) tags`;
      return { total: row.total, withText: row.withText, sensitive: row.sensitive, tags: row.tags ?? [] };
    }),
    prisma.mediaAsset.count({ where: { status: { in: ["pending", "failed"] }, attempts: { lt: 3 } } }),
    keyId ? projectReady(keyId).then((ready) => !ready) : Promise.resolve(false),
  ]);
  return { ...page, view: query.view, stats: { ...summary, pending, syncing } };
}

type AssetRow = { id: string; url: string; kind: VisualKind; width: number | null; height: number | null; tags: VisualAsset["tags"] | null;
  sensitive: string[]; ocrText: string | null; ocrWords: number; keyText: string | null; twinGroup: string | null; usedBy: number;
  actionCall: VisualAsset["actionCall"]; narrative: string | null; claims: string[]; unreadText: boolean };

const toAsset = (r: AssetRow, twins: Map<string | null, number>): Omit<VisualAsset, "uses" | "lastSeen"> => ({
  id: r.id, url: r.url, kind: r.kind, width: r.width, height: r.height, tags: r.tags ?? [], sensitive: r.sensitive,
  ocrText: r.ocrText ?? "", ocrWords: r.ocrWords, keyText: r.keyText ?? "", usedBy: r.usedBy, twins: r.twinGroup ? twins.get(r.twinGroup) ?? 0 : 0,
  actionCall: r.actionCall ?? null, narrative: r.narrative, claims: r.claims ?? [], unreadText: r.unreadText,
});

/** Re-shared pictures: other images in the same near-duplicate group (twins.ts), anywhere in the store. */
async function twinCounts(groups: (string | null)[]) {
  const g = [...new Set(groups.filter((x): x is string => !!x))];
  const rows = g.length ? await prisma.mediaAsset.groupBy({ by: ["twinGroup"], where: { twinGroup: { in: g }, placeholder: false }, _count: { _all: true } }) : [];
  return new Map<string | null, number>(rows.map((t) => [t.twinGroup, t._count._all - 1]));
}

/** The posts/articles behind (type, code) pairs, for cards, the detail list and the post modal. */
async function itemsFor(refs: { type: MediaType; code: string }[]) {
  const items = new Map<string, MediaItem>();
  for (const type of ["social", "online"] as const) {
    const codes = [...new Set(refs.filter((r) => r.type === type).map((r) => r.code))];
    if (codes.length) for (const it of await fetchItemsByCode(type, codes)) items.set(`${type}:${it.code}`, it);
  }
  return items;
}

async function imagePage(query: VisualQuery, cond: ReturnType<typeof conditions>): Promise<Pick<Page, "items" | "posts" | "narratives" | "hasMore" | "next">> {
  // Keyset paging on (newest use, id): new images arriving while scrolling don't shift later pages.
  const after = query.after ? Prisma.sql`HAVING (max(l."publishedAt"), a.id) < (${query.after.ts}::timestamp, ${query.after.id})` : Prisma.empty;
  const rows = await prisma.$queryRaw<(AssetRow & { lastSeen: Date; lastSeenTs: string; uses: { type: MediaType; code: string; source: string; publishedAt: string }[] })[]>`
    SELECT a.id, a.url, a.kind, a.width, a.height, a.tags, a.sensitive, a."ocrText", a."ocrWords", a."keyText", a."twinGroup", a."actionCall", a.narrative, a.claims, a."unreadText",
           count(*)::int "usedBy", max(l."publishedAt") "lastSeen", to_char(max(l."publishedAt"), 'YYYY-MM-DD"T"HH24:MI:SS.US') "lastSeenTs",
           (array_agg(json_build_object('type', l.type, 'code', l.code, 'source', l.source, 'publishedAt', l."publishedAt") ORDER BY l."publishedAt" DESC))[1:${USES_SHOWN}] uses
    FROM "MediaAsset" a JOIN "MediaLink" l ON l."assetId" = a.id
    WHERE ${where([...cond.link, ...cond.shown, ...cond.match])}
    GROUP BY a.id ${after} ORDER BY "lastSeen" DESC, a.id DESC LIMIT ${VISUAL_PAGE_SIZE + 1}`;
  const page = rows.slice(0, VISUAL_PAGE_SIZE);
  const [twins, items] = await Promise.all([twinCounts(page.map((r) => r.twinGroup)), itemsFor(page.flatMap((r) => r.uses))]);
  const last = page.at(-1);
  return {
    posts: [], narratives: [],
    hasMore: rows.length > VISUAL_PAGE_SIZE,
    next: rows.length > VISUAL_PAGE_SIZE && last ? formatVisualCursor({ ts: last.lastSeenTs, id: last.id }) : null,
    items: page.map((r) => ({
      ...toAsset(r, twins), lastSeen: new Date(r.lastSeen).toISOString(),
      uses: r.uses.map((u) => ({ ...u, type: u.type ?? TYPE_OF[r.kind], publishedAt: new Date(u.publishedAt).toISOString(), item: items.get(`${u.type}:${u.code}`) ?? null })),
    })),
  };
}

async function postPage(query: VisualQuery, cond: ReturnType<typeof conditions>): Promise<Pick<Page, "items" | "posts" | "narratives" | "hasMore" | "next">> {
  // Posts with at least one shown image that matches the filters, newest first; keyset on (published, type:code).
  const after = query.after ? Prisma.sql`AND (l."publishedAt", l.type || ':' || l.code) < (${query.after.ts}::timestamp, ${query.after.id})` : Prisma.empty;
  const posts = await prisma.$queryRaw<{ type: MediaType; code: string; source: string; publishedAt: Date; ts: string; k: string }[]>`
    SELECT DISTINCT l.type, l.code, l.source, l."publishedAt", to_char(l."publishedAt", 'YYYY-MM-DD"T"HH24:MI:SS.US') ts, l.type || ':' || l.code k
    FROM "MediaLink" l JOIN "MediaAsset" a ON a.id = l."assetId"
    WHERE ${where([...cond.link, ...cond.shown, ...cond.match])} ${after}
    ORDER BY l."publishedAt" DESC, k DESC LIMIT ${VISUAL_PAGE_SIZE + 1}`;
  const page = posts.slice(0, VISUAL_PAGE_SIZE);
  if (!page.length) return { items: [], posts: [], narratives: [], hasMore: false, next: null };

  // Every shown image of those posts (a post shows all its images, the matching ones first), and how widely each is used.
  const keys = page.map((p) => p.k);
  const match = cond.match.length ? where(cond.match) : Prisma.sql`true`;
  const images = await prisma.$queryRaw<(AssetRow & { type: MediaType; code: string; position: number; matched: boolean })[]>`
    SELECT l.type, l.code, l.position, (${match}) matched,
           a.id, a.url, a.kind, a.width, a.height, a.tags, a.sensitive, a."ocrText", a."ocrWords", a."keyText", a."twinGroup", a."actionCall", a.narrative, a.claims, a."unreadText",
           (SELECT count(*)::int FROM "MediaLink" u WHERE u."assetId" = a.id) "usedBy"
    FROM "MediaLink" l JOIN "MediaAsset" a ON a.id = l."assetId"
    WHERE (l.type || ':' || l.code) = ANY(${keys}) AND ${where(cond.shown)}
    ORDER BY l.position`;
  const [twins, items] = await Promise.all([twinCounts(images.map((r) => r.twinGroup)), itemsFor(page)]);

  const last = page.at(-1)!;
  return {
    items: [], narratives: [],
    hasMore: posts.length > VISUAL_PAGE_SIZE,
    next: posts.length > VISUAL_PAGE_SIZE ? formatVisualCursor({ ts: last.ts, id: last.k }) : null,
    posts: page.map((p): VisualPost => {
      const imgs = images.filter((i) => i.type === p.type && i.code === p.code)
        .map((i) => ({ ...toAsset(i, twins), position: i.position, matched: i.matched, uses: [], lastSeen: new Date(p.publishedAt).toISOString() }))
        .sort((a, b) => Number(b.matched) - Number(a.matched) || a.position - b.position);
      return {
        key: p.k, type: p.type, code: p.code, source: p.source, publishedAt: new Date(p.publishedAt).toISOString(),
        item: items.get(p.k) ?? null, images: imgs,
        keyText: mergeKeyText(imgs.map((i) => i.keyText)), tags: mergeTags(imgs.map((i) => i.tags)),
        sensitive: [...new Set(imgs.flatMap((i) => i.sensitive))],
        actionCall: imgs.find((i) => i.actionCall)?.actionCall ?? null, claims: [...new Set(imgs.flatMap((i) => i.claims))].slice(0, 8), unreadText: imgs.some((i) => i.unreadText),
        narratives: [...new Set(imgs.map((i) => i.narrative).filter((n): n is string => !!n))],
        twins: Math.max(0, ...imgs.map((i) => i.twins)), sharedElsewhere: Math.max(0, ...imgs.map((i) => i.usedBy - 1)),
      };
    }),
  };
}

const TWINS_SHOWN = 24;

/** Other images in the same near-duplicate group as `id`, newest use first, each with the post/article using it. */
export async function twinsOf(id: string): Promise<{ total: number; twins: VisualTwin[] }> {
  const me = await prisma.mediaAsset.findUnique({ where: { id }, select: { twinGroup: true } });
  if (!me?.twinGroup) return { total: 0, twins: [] };
  const rows = await prisma.$queryRaw<{ id: string; url: string; kind: VisualKind; width: number | null; height: number | null; type: MediaType; code: string; source: string; publishedAt: Date }[]>`
    SELECT DISTINCT ON (a.id) a.id, a.url, a.kind, a.width, a.height, l.type, l.code, l.source, l."publishedAt"
    FROM "MediaAsset" a JOIN "MediaLink" l ON l."assetId" = a.id
    WHERE a."twinGroup" = ${me.twinGroup} AND a.id <> ${id} AND a.status = 'done' AND NOT a.placeholder
    ORDER BY a.id, l."publishedAt" DESC`;
  rows.sort((a, b) => +b.publishedAt - +a.publishedAt);
  const shown = rows.slice(0, TWINS_SHOWN);
  const items = await itemsFor(shown);
  return {
    total: rows.length,
    twins: shown.map((r) => ({ id: r.id, url: r.url, kind: r.kind, width: r.width, height: r.height,
      use: { type: r.type, code: r.code, source: r.source, publishedAt: new Date(r.publishedAt).toISOString(), item: items.get(`${r.type}:${r.code}`) ?? null } })),
  };
}

/** Shared narratives of the period: the same message (narrative key) on images of several posts, most posts first. */
async function narrativePage(cond: ReturnType<typeof conditions>): Promise<Pick<Page, "items" | "posts" | "narratives" | "hasMore" | "next">> {
  const rows = await prisma.$queryRaw<{ key: string; posts: number; images: number; first: Date; last: Date; sample: string }[]>`
    SELECT a.narrative key, count(DISTINCT (l.type, l.code))::int posts, count(DISTINCT a.id)::int images,
           min(l."publishedAt") first, max(l."publishedAt") last, (array_agg(a.id ORDER BY l."publishedAt" DESC))[1] sample
    FROM "MediaLink" l JOIN "MediaAsset" a ON a.id = l."assetId"
    WHERE ${where([...cond.link, ...cond.shown, ...cond.match])} AND a.narrative IS NOT NULL
    GROUP BY a.narrative HAVING count(DISTINCT (l.type, l.code)) >= ${NARRATIVE_MIN_POSTS}
    ORDER BY posts DESC, last DESC LIMIT ${VISUAL_PAGE_SIZE}`;
  const samples = new Map((await prisma.mediaAsset.findMany({ where: { id: { in: rows.map((r) => r.sample) } }, select: { id: true, url: true, kind: true, width: true, height: true, keyText: true } })).map((a) => [a.id, a]));
  return {
    items: [], posts: [], hasMore: false, next: null,
    narratives: rows.flatMap((r) => {
      const a = samples.get(r.sample);
      return a ? [{ key: r.key, posts: r.posts, images: r.images, first: new Date(r.first).toISOString(), last: new Date(r.last).toISOString(),
        sample: { id: a.id, url: a.url, kind: a.kind as VisualKind, width: a.width, height: a.height, keyText: a.keyText ?? "" } }] : [];
    }),
  };
}
