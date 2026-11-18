// What the media worker draws from an image's key text: calls to action, narrative keys, numeric claims
// (src/lib/mediaVisual.ts), and which projects the image matches by its text (MediaLink.imageKeys). The last one lets a
// post whose caption doesn't name a project keyword ("😡😡" under a poster saying "...Polri...") count for that project:
// the source-database queries of a project include those codes (withImageCodes → bank/query.ts scopeConditions).
import { parseKeyScope, type KeyScope } from "@/lib/media/keyScope";
import type { MediaType } from "@/lib/media/types";
import { detectActionCall, keyText, mergeKeyText, narrativeKey, numericClaims, splitJoinedText, type OcrLine } from "@/lib/mediaVisual";
import { wordFreq } from "./kata";
import { keywordQuery, searchTerms } from "../bank/query";
import { sharedCache } from "../bank/cache";
import { prisma } from "../db";
import { RETENTION_DAYS } from "./projects";

/** Bump when the rules in mediaVisual.ts change: analysed images are re-derived in the background. */
export const TEXT_RULES_VERSION = 2; // 2: words OCR ran together split (kata.txt); calls to action need a call word
const DERIVE_BATCH = 1000;

type Project = { id: string; query: string };

/** Projects with keywords and their full-text query (the same one the source database uses for captions). */
async function keywordProjects(): Promise<Project[]> {
  const keys = await prisma.apiKey.findMany({ where: { revokedAt: null }, select: { id: true, keywords: true } });
  return keys.map((k) => ({ id: k.id, query: keywordQuery(k.keywords) })).filter((p) => p.query);
}

/** Projects whose keywords appear in one text ('indonesian' stemming, like post_content_tsv in the source database). */
async function matchingProjects(text: string, projects: Project[]) {
  if (!text || !projects.length) return [];
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT p.id FROM unnest(${projects.map((p) => p.id)}::text[], ${projects.map((p) => p.query)}::text[]) AS p(id, q)
    WHERE to_tsvector('indonesian', ${text}) @@ to_tsquery('indonesian', p.q)`;
  return rows.map((r) => r.id);
}

/** Derived signals and project matches for one analysed image; its links get the matched projects. */
export async function applyTextSignals(assetId: string, keyText: string, projects?: Project[]) {
  const action = detectActionCall(keyText);
  await prisma.mediaAsset.update({
    where: { id: assetId },
    data: { actionCall: action ?? undefined, narrative: narrativeKey(keyText), claims: numericClaims(keyText), textRules: TEXT_RULES_VERSION },
  });
  if (action === null) await prisma.$executeRaw`UPDATE "MediaAsset" SET "actionCall" = NULL WHERE id = ${assetId} AND "actionCall" IS NOT NULL`;
  const matched = await matchingProjects(keyText, projects ?? await keywordProjects());
  if (matched.length) {
    await prisma.$executeRaw`UPDATE "MediaLink" SET
      "imageKeys" = ARRAY(SELECT DISTINCT unnest("imageKeys" || ${matched}::text[])),
      keys = ARRAY(SELECT DISTINCT unnest(keys || ${matched}::text[]))
      WHERE "assetId" = ${assetId}`;
  }
}

/** The key text of OCR lines (see keyText), with words OCR ran together split ("RESMIMUNDUR" → "RESMI MUNDUR"). */
export function computeKeyText(lines: OcrLine[], context: string | null) {
  const { words, total } = wordFreq();
  return keyText(lines.map((l) => ({ ...l, t: splitJoinedText(l.t, words, total) })), context);
}

/** Analysed images derived with older rules (or before this existed): their key text is rebuilt from the stored OCR
 *  lines and their signals derived again, a batch per tick. Returns how many were done. */
export async function refreshTextSignals() {
  const rows = await prisma.mediaAsset.findMany({
    where: { status: "done", textRules: { lt: TEXT_RULES_VERSION } }, select: { id: true, keyText: true, ocrLines: true, context: true },
    orderBy: { analyzedAt: "desc" }, take: DERIVE_BATCH,
  });
  if (!rows.length) return 0;
  const projects = await keywordProjects();
  for (const r of rows) {
    let text = r.keyText ?? "";
    if (Array.isArray(r.ocrLines)) {
      const key = computeKeyText(r.ocrLines as OcrLine[], r.context);
      text = key.text;
      await prisma.mediaAsset.update({ where: { id: r.id }, data: { keyText: key.text, keyWords: key.words } });
    }
    await applyTextSignals(r.id, text, projects);
  }
  return rows.length;
}

/** A project's scope changed (or it is new): match its keywords against every stored image text again. */
export async function rematchProject(keyId: string, keywords: string[]) {
  await prisma.$executeRaw`UPDATE "MediaLink" SET "imageKeys" = array_remove("imageKeys", ${keyId}) WHERE ${keyId} = ANY("imageKeys")`;
  const query = keywordQuery(keywords);
  if (!query) return;
  await prisma.$executeRaw`UPDATE "MediaLink" l SET
      "imageKeys" = array_append(l."imageKeys", ${keyId}),
      keys = CASE WHEN ${keyId} = ANY(l.keys) THEN l.keys ELSE array_append(l.keys, ${keyId}) END
    FROM "MediaAsset" a
    WHERE a.id = l."assetId" AND a."keyWords" > 0 AND to_tsvector('indonesian', a."keyText") @@ to_tsquery('indonesian', ${query})`;
}

// ── For the source-database queries of a project ──────────────────────────────────────────────────────────────────────

type ImageCodes = Partial<Record<MediaType, string[]>>;
const codesCache = sharedCache<ImageCodes>("media.imageCodes", { ttlMs: 60_000, maxEntries: 200, staleWhileRevalidate: true });

/** Item codes a project matches only through image text (within the retention period). */
export function imageCodesFor(keyId: string): Promise<ImageCodes> {
  return codesCache(keyId, async () => {
    const since = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString().slice(0, 23);
    const rows = await prisma.$queryRaw<{ type: MediaType; code: string }[]>`
      SELECT DISTINCT type, code FROM "MediaLink" WHERE ${keyId} = ANY("imageKeys") AND "publishedAt" >= ${since}::timestamp`;
    const out: ImageCodes = {};
    for (const r of rows) (out[r.type] ??= []).push(r.code);
    return out;
  });
}

/** A project's scope plus the items it matches by image text. Never fails: without the media tables it is the plain scope. */
export async function withImageCodes(keyId: string | null | undefined, scope: KeyScope): Promise<KeyScope> {
  if (!keyId || !scope.keywords.length) return scope;
  try {
    const imageCodes = await imageCodesFor(keyId);
    return imageCodes.social?.length || imageCodes.online?.length ? { ...scope, imageCodes } : scope;
  } catch {
    return scope;
  }
}

/** Same, from a stored key row. */
export const scopeWithImages = (key: { id: string; scope: unknown; keywords: string[] }) => withImageCodes(key.id, parseKeyScope(key.scope, key.keywords));

const searchCache = sharedCache<Partial<Record<MediaType, string[]>>>("media.imageSearch", { ttlMs: 60_000, maxEntries: 200, staleWhileRevalidate: true });
/** Most items an image-text search adds to a source query. */
const SEARCH_CODES = 2000;

/** Item codes whose image text matches a search (the same "a OR b" terms and 'indonesian' stemming as captions). */
export function imageSearchCodes(terms: string[]) {
  return searchCache(terms.join("\u0001"), async () => {
    if (!terms.length) return {};
    const since = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString().slice(0, 23);
    const rows = await prisma.$queryRaw<{ type: MediaType; code: string }[]>`
      SELECT DISTINCT l.type, l.code, l."publishedAt" FROM "MediaLink" l JOIN "MediaAsset" a ON a.id = l."assetId"
      WHERE a."keyWords" > 0 AND l."publishedAt" >= ${since}::timestamp
        AND EXISTS (SELECT 1 FROM unnest(${terms}::text[]) t WHERE to_tsvector('indonesian', a."keyText") @@ plainto_tsquery('indonesian', t))
      ORDER BY l."publishedAt" DESC LIMIT ${SEARCH_CODES}`;
    const out: Partial<Record<MediaType, string[]>> = {};
    for (const r of rows) (out[r.type] ??= []).push(r.code);
    return out;
  });
}

/** A scope plus the items whose image text matches the request's search; unchanged without a search. */
export async function withImageSearch(scope: KeyScope, q: string | null): Promise<KeyScope> {
  const terms = q?.trim() ? searchTerms(q.trim().slice(0, 200)) : [];
  if (!terms.length) return scope;
  try {
    const imageSearch = await imageSearchCodes(terms);
    return imageSearch.social?.length || imageSearch.online?.length ? { ...scope, imageSearch } : scope;
  } catch {
    return scope;
  }
}

/** Longest image text added to an item for AI categorisation and the daily summary. */
const AI_IMAGE_CHARS = 600;

/** Key text of each item's images (in position order, each line once), for the AI: the message of a meme or poster
 *  whose caption is empty or only emojis. Empty map when nothing was analysed. */
export async function imageTextFor(type: MediaType, codes: string[]): Promise<Map<string, string>> {
  if (!codes.length) return new Map();
  try {
    const rows = await prisma.$queryRaw<{ code: string; text: string }[]>`
      SELECT l.code, string_agg(a."keyText", E'\\n' ORDER BY l.position) text
      FROM "MediaLink" l JOIN "MediaAsset" a ON a.id = l."assetId"
      WHERE l.type = ${type} AND l.code = ANY(${codes}::text[]) AND a."keyWords" > 0 AND NOT a.placeholder
      GROUP BY l.code`;
    return new Map(rows.map((r) => [r.code, mergeKeyText([r.text]).slice(0, AI_IMAGE_CHARS)]));
  } catch {
    return new Map();
  }
}
