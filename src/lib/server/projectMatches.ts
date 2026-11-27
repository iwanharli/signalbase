// Keyword matches stored in the Signalbase database, for projects with a long keyword list.
//
// One full-text search over hundreds of phrases makes Postgres check every post that contains a common word ("polisi")
// against each phrase: PPIS (346 keywords) needed 255 s to count 7 days of posts, so its Beranda, media pages and SNA
// timed out. Instead, this worker matches each item once: new items every minute (forward cursor on the source table's
// insert id) and the older ones back to BACKFILL_DAYS in small id chunks. Once a project's backfill is done, its queries
// read the stored codes (bank/query.ts scopeConditions, `scope.matched`); before that, and for anything older than the
// backfill, they search as before.
import { createHash } from "node:crypto";
import { allowsType, parseKeyScope, type KeyScope } from "@/lib/media/keyScope";
import type { MatchSets } from "@/lib/media/matchSet";
import { MEDIA_TYPES, type MediaType } from "@/lib/media/types";
import { sharedCache } from "./bank/cache";
import { bankPool, withLongTimeout } from "./bank/pool";
import { keywordQuery } from "./bank/query";
import { prisma } from "./db";

/** From this many keywords one combined search takes minutes (measured: 123 keywords ~100 s, 346 over 4 min). */
export const MANY_KEYWORDS = 60;
/** How far back items are matched (the longest range the panel offers per keyword). */
export const BACKFILL_DAYS = 90;
/** Source ids per matching query (social: ~31,000 new posts a day, so ~4 hours of posts). */
const CHUNK_IDS = 5_000;
const TICK_MS = 60_000;
/** Backfill work per project and media type per tick, so the source database is never busy with it for long. */
const BACKFILL_BUDGET_MS = 30_000;
const QUERY_TIMEOUT_MS = 3 * 60_000;

const SOURCE = {
  social: { table: "post_main", code: "post_code", ts: "post_timestamps", tsv: "post_content_tsv" },
  online: { table: "news_main", code: "news_code", ts: "news_timestamp", tsv: "news_title_tsv" },
} as const;

export const keywordsHash = (keywords: string[]) => createHash("sha1").update(keywordQuery(keywords)).digest("hex");
export const usesMatches = (keywords: string[]) => keywords.length >= MANY_KEYWORDS;

const jakartaDay = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
/** Naive source timestamps are stored as if they were UTC, so they read back unchanged. */
const naive = (value: string) => new Date(`${value}Z`);

const loaded = sharedCache<MatchSets>("projectMatches", { ttlMs: 60_000, maxEntries: 20, staleWhileRevalidate: true });

/** The stored matches a project's queries may use: only media types whose backfill is done, made with its current
 *  keywords. Empty while matching is still under way (queries then search as before). */
export function matchSets(projectId: string, keywords: string[]): Promise<MatchSets> {
  const hash = keywordsHash(keywords);
  return loaded(`${projectId}|${hash}`, async () => {
    const rows = await prisma.$queryRaw<{ type: MediaType; coverFrom: string; codes: string[] | null; at: string[] | null }[]>`
      SELECT s.type, to_char(s."coverFrom", 'YYYY-MM-DD') "coverFrom",
        array_agg(m.code ORDER BY m.at) FILTER (WHERE m.code IS NOT NULL) codes,
        array_agg(to_char(m.at, 'YYYY-MM-DD"T"HH24:MI:SS') ORDER BY m.at) FILTER (WHERE m.code IS NOT NULL) at
      FROM "ProjectMatchState" s LEFT JOIN "ProjectMatch" m ON m."projectId" = s."projectId" AND m.type = s.type
      WHERE s."projectId" = ${projectId} AND s.ready AND s."keywordsHash" = ${hash}
      GROUP BY s.type, s."coverFrom"`;
    const out: MatchSets = {};
    for (const r of rows) out[r.type] = { coverFrom: r.coverFrom, codes: r.codes ?? [], at: r.at ?? [] };
    return out;
  });
}

/** Items in (lo, hi] of the source table that match `query`, posted at or after coverFrom; stored. */
async function matchRange(projectId: string, type: MediaType, query: string, coverFrom: string, lo: bigint, hi: bigint) {
  const s = SOURCE[type];
  const { rows } = await withLongTimeout(QUERY_TIMEOUT_MS, (client) => client.query<{ code: string; at: string }>(
    `SELECT ${s.code} code, to_char(${s.ts}, 'YYYY-MM-DD"T"HH24:MI:SS.MS') at FROM ${s.table}
     WHERE id > $1 AND id <= $2 AND ${s.ts} >= $3::date AND ${s.tsv} @@ to_tsquery('indonesian', $4)`,
    [lo.toString(), hi.toString(), coverFrom, query]));
  if (rows.length) await prisma.projectMatch.createMany({ data: rows.map((r) => ({ projectId, type, code: r.code, at: naive(r.at) })), skipDuplicates: true });
  return rows.length;
}

const maxId = async (type: MediaType) =>
  BigInt((await bankPool().query<{ id: string | null }>(`SELECT max(id)::text id FROM ${SOURCE[type].table}`)).rows[0].id ?? "0");

/** New keywords (or a new project): drop the old matches and start over from the current end of the table. */
async function restart(projectId: string, type: MediaType, hash: string) {
  const s = SOURCE[type];
  const coverFrom = jakartaDay(-(BACKFILL_DAYS - 1));
  const high = await maxId(type);
  // Every item posted since coverFrom has an id above floorId (whenever it was collected).
  const { rows } = await withLongTimeout(QUERY_TIMEOUT_MS, (client) => client.query<{ id: string | null }>(
    `SELECT min(id)::text id FROM ${s.table} WHERE ${s.ts} >= $1::date`, [coverFrom]));
  const floor = rows[0].id ? BigInt(rows[0].id) - BigInt(1) : high;
  await prisma.$transaction([
    prisma.projectMatch.deleteMany({ where: { projectId, type } }),
    prisma.projectMatchState.upsert({
      where: { projectId_type: { projectId, type } },
      create: { projectId, type, keywordsHash: hash, coverFrom: naive(`${coverFrom}T00:00:00`), highId: high, lowId: high, floorId: floor, ready: false },
      update: { keywordsHash: hash, coverFrom: naive(`${coverFrom}T00:00:00`), highId: high, lowId: high, floorId: floor, ready: false },
    }),
  ]);
  console.log(`[matches] ${projectId} ${type}: mulai mencocokkan ${BACKFILL_DAYS} hari (id ${floor}..${high})`);
}

async function advance(project: { id: string; name: string; keywords: string[] }, type: MediaType) {
  const query = keywordQuery(project.keywords);
  const hash = keywordsHash(project.keywords);
  let state = await prisma.projectMatchState.findUnique({ where: { projectId_type: { projectId: project.id, type } } });
  if (!state || state.keywordsHash !== hash) {
    await restart(project.id, type, hash);
    state = await prisma.projectMatchState.findUniqueOrThrow({ where: { projectId_type: { projectId: project.id, type } } });
  }
  const coverFrom = state.coverFrom.toISOString().slice(0, 10);

  // Forward: everything collected since the last tick.
  const top = await maxId(type);
  let high = state.highId;
  while (high < top) {
    const next = high + BigInt(CHUNK_IDS) < top ? high + BigInt(CHUNK_IDS) : top;
    await matchRange(project.id, type, query, coverFrom, high, next);
    high = next;
    await prisma.projectMatchState.update({ where: { projectId_type: { projectId: project.id, type } }, data: { highId: high } });
  }

  // Backfill, a bounded amount per tick.
  let low = state.lowId;
  const started = Date.now();
  while (!state.ready && low > state.floorId && Date.now() - started < BACKFILL_BUDGET_MS) {
    const next = low - BigInt(CHUNK_IDS) > state.floorId ? low - BigInt(CHUNK_IDS) : state.floorId;
    await matchRange(project.id, type, query, coverFrom, next, low);
    low = next;
    const ready = low <= state.floorId;
    await prisma.projectMatchState.update({ where: { projectId_type: { projectId: project.id, type } }, data: { lowId: low, ready } });
    if (ready) console.log(`[matches] ${project.name} ${type}: siap (${await prisma.projectMatch.count({ where: { projectId: project.id, type } })} item sejak ${coverFrom})`);
  }
}

/** Matching progress for a project's settings: per media type, the share of the backfill done (1 = ready). */
export async function matchProgress(projectId: string) {
  const states = await prisma.projectMatchState.findMany({ where: { projectId } });
  return Object.fromEntries(states.map((s) => {
    const total = Number(s.highId - s.floorId) || 1;
    return [s.type, s.ready ? 1 : Math.min(0.99, Number(s.highId - s.lowId) / total)];
  })) as Partial<Record<MediaType, number>>;
}

async function tick() {
  const projects = await prisma.project.findMany({ where: { revokedAt: null }, select: { id: true, name: true, scope: true, keywords: true } });
  const big = projects.filter((p) => usesMatches(p.keywords));
  // Projects that no longer need stored matches (shorter list, revoked) give them up.
  const keep = big.map((p) => p.id);
  await prisma.projectMatchState.deleteMany({ where: { projectId: { notIn: keep } } });
  await prisma.projectMatch.deleteMany({ where: { projectId: { notIn: keep } } });
  for (const p of big) {
    const scope: KeyScope = parseKeyScope(p.scope, p.keywords);
    for (const type of MEDIA_TYPES) {
      if (!allowsType(scope, type)) continue;
      try { await advance(p, type); } catch (e) { console.warn(`[matches] ${p.name} ${type} gagal: ${(e as Error).message}`); }
    }
  }
}

/** Starts the matcher once per server process (production; see instrumentation-node.ts). */
export function startProjectMatcher() {
  const g = globalThis as unknown as { projectMatcher?: NodeJS.Timeout };
  if (g.projectMatcher) return;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await tick(); } catch (e) { console.warn("[matches] gagal:", (e as Error).message); } finally { running = false; }
  };
  void run();
  g.projectMatcher = setInterval(run, TICK_MS);
}
