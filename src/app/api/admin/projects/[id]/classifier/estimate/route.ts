import { NextResponse } from "next/server";
import { allowsType, parseKeyScope, type KeyScope } from "@/lib/media/keyScope";
import { MEDIA_TYPES, type MediaType } from "@/lib/media/types";
import { countExact } from "@/lib/server/bank";
import { costPerItem } from "@/lib/server/ai/balance";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { scopeCountsFor, type StoredScopeCounts } from "@/lib/ai/progress";

/** A Date as local wall-clock time, matching how timestamps from the source database are read. */
const wallClock = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

type Counts = (readonly [MediaType, number | null])[];
const countScope = (scope: KeyScope, filter: URLSearchParams): Promise<Counts> =>
  Promise.all(MEDIA_TYPES.map(async (type) => [type, allowsType(scope, type) ? await countExact(type, filter, scope) : null] as const));

/** Fresh for this long; older counts are still served while a new count runs in the background. */
const FRESH_MS = 10 * 60_000;
const refreshing = new Set<string>();

/**
 * Scope counts are slow (~25 s), so the last result is stored on the classifier per range ("" = whole scope, else the
 * start as ISO) and served at once; the progress dock reads the same numbers (scopeCountsFor). When older than FRESH_MS,
 * a recount starts in the background; only the very first call waits.
 */
async function storedCounts(projectId: string, scope: KeyScope, range: string, filter: URLSearchParams): Promise<Counts> {
  const row = await prisma.classifier.findUnique({ where: { projectId }, select: { scopeCounts: true } });
  const scopeKey = JSON.stringify(scope);
  const recount = async () => {
    const counts = await countScope(scope, filter);
    const fresh = await prisma.classifier.findUnique({ where: { projectId }, select: { scopeCounts: true } });
    const prev = fresh?.scopeCounts as StoredScopeCounts | null;
    const ranges = prev?.scope === scopeKey && prev.ranges ? prev.ranges : {};
    const value: StoredScopeCounts = { scope: scopeKey, ranges: { ...ranges, [range]: { ...Object.fromEntries(counts), at: Date.now() } } };
    await prisma.classifier.update({ where: { projectId }, data: { scopeCounts: value } }).catch(() => {});
    return counts;
  };
  const stored = scopeCountsFor(row?.scopeCounts, scopeKey, range);
  if (!stored) return row ? recount() : countScope(scope, filter);
  if (Date.now() - stored.at > FRESH_MS && !refreshing.has(`${projectId}|${range}`)) {
    refreshing.add(`${projectId}|${range}`);
    recount().catch(() => {}).finally(() => refreshing.delete(`${projectId}|${range}`));
  }
  return MEDIA_TYPES.map((type) => [type, stored[type] ?? null] as const);
}

type Context = { params: Promise<{ id: string }> };

// How many items AI categorisation covers for this key: its keywords and scope, from `from` (YYYY-MM-DD) to now.
export const GET = adminRoute(async (req: Request, { params }: Context) => {
  const { id } = await params;
  const key = await prisma.project.findUnique({ where: { id }, select: { scope: true, keywords: true, classifier: { select: { startFrom: true } } } });
  if (!key) return NextResponse.json({ error: "Proyek tidak ditemukan" }, { status: 404 });
  const scope = parseKeyScope(key.scope, key.keywords);
  const query = new URL(req.url).searchParams;
  // ?since=<ISO> counts from that exact moment, as the worker does; omitted = the whole scope.
  const sinceParam = query.get("since");
  const start = sinceParam && !Number.isNaN(Date.parse(sinceParam)) ? new Date(sinceParam) : null;
  const filter = new URLSearchParams(start ? { since: wallClock(start) } : {});
  try {
    const [counts, cost, done] = await Promise.all([
      // The whole scope and the project's saved start are stored; a date being tried in the editor is counted live.
      !start || start.getTime() === key.classifier?.startFrom?.getTime()
        ? storedCounts(id, scope, start ? start.toISOString() : "", filter)
        : countScope(scope, filter),
      costPerItem(id),
      Promise.all(MEDIA_TYPES.map((type) => prisma.classification.count({ where: { projectId: id, type,
        ...(start ? { publishedAt: { gte: start } } : {}) } }))),
    ]);
    const byType = Object.fromEntries(counts) as Record<MediaType, number | null>;
    const doneByType = Object.fromEntries(MEDIA_TYPES.map((t, i) => [t, done[i]])) as Record<MediaType, number>;
    const total = (byType.social ?? 0) + (byType.online ?? 0);
    const doneTotal = done.reduce((s, n) => s + n, 0);
    // Cost of what is still left to label in this range, at the measured price per item.
    const remaining = Math.max(0, total - doneTotal);
    return NextResponse.json({
      ...byType, done: doneTotal, doneByType, remaining,
      cost: cost && { currency: cost.currency, perThousand: cost.perItem * 1000, remaining: cost.perItem * remaining, sample: cost.sample },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Jumlah data belum bisa dihitung" }, { status: 502 });
  }
});
