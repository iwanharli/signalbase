// Which projects see which media (MediaLink.keys), kept by the media worker so the media page can filter by project
// without asking the source database on every request. New items are tagged when collected (tagItems); a new project
// or a changed scope is backfilled over the stored links, newest first, a batch per tick (backfillProjects).
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { allowsType, OPEN_SCOPE, parseKeyScope, type KeyScope } from "@/lib/media/keyScope";
import type { MediaType } from "@/lib/media/types";
import { filterCodes } from "../bank";
import { prisma } from "../db";
import { rematchProject } from "./textSignals";

/** Links re-checked per project per tick while backfilling. */
const BACKFILL_BATCH = 1500;
/** Media older than this is removed (links first, then images no link uses). The page shows at most 30 days. */
export const RETENTION_DAYS = Number(process.env.MEDIA_RETENTION_DAYS ?? 90);

type Project = { id: string; scope: KeyScope; signature: string };

const isOpen = (s: KeyScope) => JSON.stringify(s) === JSON.stringify(OPEN_SCOPE);

async function projects(): Promise<Project[]> {
  const keys = await prisma.apiKey.findMany({ where: { revokedAt: null }, select: { id: true, scope: true, keywords: true } });
  return keys.map((k) => {
    const scope = parseKeyScope(k.scope, k.keywords);
    return { id: k.id, scope, signature: createHash("sha256").update(JSON.stringify(scope)).digest("hex").slice(0, 16) };
  });
}

/** Codes (per type) that a project's scope includes. */
async function matching(p: Project, byType: Record<MediaType, string[]>) {
  const out: { type: MediaType; codes: string[] }[] = [];
  for (const type of ["social", "online"] as const) {
    const codes = byType[type];
    if (!codes.length || !allowsType(p.scope, type)) continue;
    out.push({ type, codes: isOpen(p.scope) ? codes : await filterCodes(type, new URLSearchParams(), p.scope, codes) });
  }
  return out;
}

async function addKey(keyId: string, type: MediaType, codes: string[]) {
  if (!codes.length) return;
  await prisma.$executeRaw`UPDATE "MediaLink" SET keys = array_append(keys, ${keyId})
    WHERE type = ${type} AND code = ANY(${codes}) AND NOT (${keyId} = ANY(keys))`;
}

const group = (items: { type: string; code: string }[]) => {
  const byType: Record<MediaType, string[]> = { social: [], online: [] };
  for (const i of items) if (i.type === "social" || i.type === "online") byType[i.type].push(i.code);
  for (const t of ["social", "online"] as const) byType[t] = [...new Set(byType[t])];
  return byType;
};

/** Tags just-collected items with every project whose scope includes them. */
export async function tagItems(items: { type: MediaType; code: string }[]) {
  if (!items.length) return;
  const byType = group(items);
  for (const p of await projects()) {
    try {
      for (const m of await matching(p, byType)) await addKey(p.id, m.type, m.codes);
    } catch (e) {
      console.warn(`[media] proyek ${p.id}: penandaan gagal`, (e as Error).message);
    }
  }
}

/** One backfill step for every project that is new or whose scope changed. Returns how many links were checked. */
export async function backfillProjects() {
  let checked = 0;
  const list = await projects();
  const syncs = new Map((await prisma.mediaProjectSync.findMany()).map((s) => [s.keyId, s]));
  for (const p of list) {
    let sync = syncs.get(p.id);
    if (!sync || sync.signature !== p.signature) {
      // New scope: forget the old tags and walk all links again from the newest.
      if (sync) await prisma.$executeRaw`UPDATE "MediaLink" SET keys = array_remove(keys, ${p.id}) WHERE ${p.id} = ANY(keys)`;
      // …and match its keywords against every stored image text (a single SQL update).
      const key = await prisma.apiKey.findUnique({ where: { id: p.id }, select: { keywords: true } });
      await rematchProject(p.id, key?.keywords ?? []).catch((e) => console.warn(`[media] proyek ${p.id}: pencocokan teks gambar gagal`, (e as Error).message));
      sync = await prisma.mediaProjectSync.upsert({
        where: { keyId: p.id }, create: { keyId: p.id, signature: p.signature },
        update: { signature: p.signature, cursorAt: null, cursorCode: null, done: false },
      });
    }
    if (sync.done) continue;
    const cursor = sync.cursorAt && sync.cursorCode !== null ? Prisma.sql`AND ("publishedAt", code) < (${sync.cursorAt}::timestamp, ${sync.cursorCode})` : Prisma.empty;
    const rows = await prisma.$queryRaw<{ type: string; code: string; ts: string }[]>`
      SELECT type, code, to_char("publishedAt", 'YYYY-MM-DD"T"HH24:MI:SS.US') ts FROM "MediaLink"
      WHERE true ${cursor} ORDER BY "publishedAt" DESC, code DESC LIMIT ${BACKFILL_BATCH}`;
    // (Tagging is per item code, so a page that ends between two images of one item loses nothing.)
    try {
      for (const m of await matching(p, group(rows))) await addKey(p.id, m.type, m.codes);
    } catch (e) {
      console.warn(`[media] proyek ${p.id}: backfill gagal, dicoba lagi`, (e as Error).message);
      continue;
    }
    const last = rows.at(-1);
    await prisma.mediaProjectSync.update({
      where: { keyId: p.id },
      data: last && rows.length === BACKFILL_BATCH ? { cursorAt: last.ts, cursorCode: last.code } : { done: true },
    });
    checked += rows.length;
  }
  // Revoked or deleted projects: their sync rows go; their ids in MediaLink.keys are harmless and age out.
  const ids = list.map((p) => p.id);
  await prisma.mediaProjectSync.deleteMany({ where: { keyId: { notIn: ids } } });
  return checked;
}

/** Whether a project's tags are complete (false while it is still being backfilled). */
export async function projectReady(keyId: string) {
  const s = await prisma.mediaProjectSync.findUnique({ where: { keyId }, select: { done: true } });
  return !!s?.done;
}

/** Indexes Prisma cannot declare: trigram search on the text read from images (pg_trgm, a trusted extension). */
export async function ensureMediaIndexes() {
  try {
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "MediaAsset_ocrText_trgm"`); // search moved to keyText
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "MediaAsset_keyText_trgm" ON "MediaAsset" USING gin ("keyText" gin_trgm_ops)`);
  } catch (e) {
    console.warn("[media] indeks pencarian teks tidak dibuat (pencarian tetap jalan, lebih lambat):", (e as Error).message);
  }
}

/** Removes media older than RETENTION_DAYS. */
export async function cleanupOldMedia() {
  const before = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
  const links = await prisma.mediaLink.deleteMany({ where: { publishedAt: { lt: before } } });
  const assets = await prisma.$executeRaw`DELETE FROM "MediaAsset" a WHERE a."createdAt" < ${before} AND NOT EXISTS (SELECT 1 FROM "MediaLink" l WHERE l."assetId" = a.id)`;
  return { links: links.count, assets };
}
