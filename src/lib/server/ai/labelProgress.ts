// Progress of AI labelling for one project, from the worker's ledger (LabelAiItem) and the labels it stored.
import { Prisma } from "@prisma/client";
import { priceFor, SEARCH_PRICE, tokenCost } from "@/lib/ai/pricing";
import { allowsType, parseKeyScope } from "@/lib/media/keyScope";
import { MEDIA_TYPES, type MediaType } from "@/lib/media/types";
import { countExact } from "../bank";
import { prisma } from "../db";
import { NEEDS_REVIEW } from "../manualLabels";
import { withImageCodes } from "../media/textSignals";
import { getSetting } from "./summary";

/** Posts the AI has been through. A person's decision counts only if the AI had worked on the post before. */
export const CHECKED: Prisma.LabelAiItemWhereInput = { OR: [{ status: { in: ["done", "empty"] } }, { status: "human", model: { not: null } }] };
const checked = (projectId: string): Prisma.LabelAiItemWhereInput => ({ projectId, ...CHECKED });

export async function labelProgress(projectId: string) {
  const [key, row] = await Promise.all([
    prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { scope: true, keywords: true, manualLabels: true } }),
    prisma.labelAi.findUnique({ where: { projectId } }),
  ]);
  if (!row) return null;
  const scope = parseKeyScope(key.scope, key.keywords);
  const inRange = row.startFrom ? { publishedAt: { gte: row.startFrom } } : {};
  const [all, ranged, empty, failed, perLabel, ai, usage, setting] = await Promise.all([
    prisma.labelAiItem.groupBy({ by: ["type"], where: checked(projectId), _count: true }),
    prisma.labelAiItem.groupBy({ by: ["type"], where: { AND: [checked(projectId), inRange] }, _count: true }),
    prisma.labelAiItem.groupBy({ by: ["type"], where: { projectId, status: "empty" }, _count: true }),
    prisma.labelAiItem.count({ where: { projectId, status: "failed" } }),
    prisma.itemLabel.groupBy({ by: ["type", "label"], where: { projectId, source: "ai" }, _count: true }),
    prisma.$queryRaw<{ all: number; review: number }[]>`
      SELECT count(*)::int AS "all", count(*) FILTER (WHERE review)::int AS review FROM (
        SELECT bool_or(${NEEDS_REVIEW}) AS review FROM "ItemLabel" WHERE "projectId" = ${projectId} AND source = 'ai' GROUP BY type, code) items`,
    prisma.labelAiUsage.findMany({ where: { projectId } }),
    getSetting(),
  ]);
  const fallback = { input: setting?.priceInput ?? 0.18, cached: setting?.priceCachedInput ?? 0.0036, output: setting?.priceOutput ?? 0.72 };
  const cost = usage.reduce((sum, u) => sum + tokenCost({ input: u.inputTokens, cached: u.cachedTokens, output: u.outputTokens }, priceFor(u.model, fallback)) + u.searches * SEARCH_PRICE, 0);
  const of = (rows: { type: string; _count: number }[], type: MediaType) => rows.find((r) => r.type === type)?._count ?? 0;
  const types = MEDIA_TYPES.filter((t) => allowsType(scope, t));
  const everChecked = all.reduce((sum, r) => sum + r._count, 0);
  const cursors = (row.cursors ?? {}) as Partial<Record<MediaType, { backfillDone?: boolean; oldest?: { ts?: string } }>>;
  return {
    enabled: row.enabled, startFrom: row.startFrom?.toISOString() ?? null, lastError: row.lastError, lastRunAt: row.lastRunAt?.toISOString() ?? null,
    todayCount: row.todayDate === new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }) ? row.todayCount : 0,
    failed, review: ai[0]?.review ?? 0, withAiLabel: ai[0]?.all ?? 0, none: empty.reduce((sum, r) => sum + r._count, 0),
    perThousand: everChecked && cost ? (cost / everChecked) * 1000 : null,
    types: types.map((type) => ({
      type, checked: of(all, type), checkedInRange: of(ranged, type), none: of(empty, type),
      backfillDone: !!cursors[type]?.backfillDone, oldest: cursors[type]?.oldest?.ts ?? null,
      labels: key.manualLabels.map((label) => ({ label, n: perLabel.find((p) => p.type === type && p.label === label)?._count ?? 0 })),
    })),
  };
}
export type LabelProgress = NonNullable<Awaited<ReturnType<typeof labelProgress>>>;

/** A Date as local wall-clock time, matching how timestamps from the source database are read. */
const wallClock = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

export type LabelTotals = Partial<Record<MediaType, number | null>>;
const FRESH_MS = 10 * 60_000;
const counting = new Map<string, Promise<LabelTotals>>();

/** Posts in the labelling range. Counting the source is slow, so the last result is served while a recount runs. */
export async function labelTotals(projectId: string): Promise<LabelTotals> {
  const [key, row] = await Promise.all([
    prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { scope: true, keywords: true } }),
    prisma.labelAi.findUnique({ where: { projectId }, select: { startFrom: true, scopeCounts: true } }),
  ]);
  const parsed = parseKeyScope(key.scope, key.keywords);
  // What was counted: a change of scope or start date makes the stored numbers wrong, not just old.
  const basis = JSON.stringify([parsed, row?.startFrom?.toISOString() ?? null]);
  const count = async () => {
    const scope = await withImageCodes(projectId, parsed);
    const filter = new URLSearchParams(row?.startFrom ? { since: wallClock(row.startFrom) } : {});
    const counts: LabelTotals = Object.fromEntries(await Promise.all(MEDIA_TYPES.filter((t) => allowsType(scope, t)).map(async (t) => [t, await countExact(t, filter, scope)] as const)));
    await prisma.labelAi.updateMany({ where: { projectId }, data: { scopeCounts: { basis, at: Date.now(), counts } } });
    return counts;
  };
  const recount = () => {
    let running = counting.get(projectId);
    if (!running) counting.set(projectId, running = count().finally(() => counting.delete(projectId)));
    return running;
  };
  const stored = row?.scopeCounts as { basis: string; at: number; counts: LabelTotals } | null | undefined;
  if (!stored || stored.basis !== basis) return recount();
  if (Date.now() - stored.at > FRESH_MS) recount().catch(() => {});
  return stored.counts;
}
