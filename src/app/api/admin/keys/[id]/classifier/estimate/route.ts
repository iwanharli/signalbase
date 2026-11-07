import { NextResponse } from "next/server";
import { allowsType, parseKeyScope, type KeyScope } from "@/lib/media/keyScope";
import { MEDIA_TYPES, type MediaType } from "@/lib/media/types";
import { countExact } from "@/lib/server/bank";
import { costPerItem } from "@/lib/server/ai/balance";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";

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
 * Whole-scope counts are slow (~25 s), so the last result is stored on the classifier and served at once.
 * When it is older than FRESH_MS, a recount starts in the background; only the very first call waits.
 */
async function wholeScopeCounts(apiKeyId: string, scope: KeyScope): Promise<Counts> {
  const row = await prisma.classifier.findUnique({ where: { apiKeyId }, select: { scopeCounts: true } });
  const stored = row?.scopeCounts as { social: number | null; online: number | null; at: number; scope: string } | null;
  const scopeKey = JSON.stringify(scope);
  const recount = async () => {
    const counts = await countScope(scope, new URLSearchParams());
    const value = { ...Object.fromEntries(counts), at: Date.now(), scope: scopeKey };
    await prisma.classifier.update({ where: { apiKeyId }, data: { scopeCounts: value } }).catch(() => {});
    return counts;
  };
  if (!stored || stored.scope !== scopeKey) return row ? recount() : countScope(scope, new URLSearchParams());
  if (Date.now() - stored.at > FRESH_MS && !refreshing.has(apiKeyId)) {
    refreshing.add(apiKeyId);
    recount().catch(() => {}).finally(() => refreshing.delete(apiKeyId));
  }
  return MEDIA_TYPES.map((type) => [type, stored[type]] as const);
}

type Context = { params: Promise<{ id: string }> };

// How many items AI categorisation covers for this key: its keywords and scope, from `from` (YYYY-MM-DD) to now.
export const GET = adminRoute(async (req: Request, { params }: Context) => {
  const { id } = await params;
  const key = await prisma.apiKey.findUnique({ where: { id }, select: { scope: true, keywords: true } });
  if (!key) return NextResponse.json({ error: "Kunci tidak ditemukan" }, { status: 404 });
  const scope = parseKeyScope(key.scope, key.keywords);
  const query = new URL(req.url).searchParams;
  // ?since=<ISO> counts from that exact moment, as the worker does; omitted = the whole scope.
  const sinceParam = query.get("since");
  const start = sinceParam && !Number.isNaN(Date.parse(sinceParam)) ? new Date(sinceParam) : null;
  const filter = new URLSearchParams(start ? { since: wallClock(start) } : {});
  try {
    const [counts, cost, done] = await Promise.all([
      start ? countScope(scope, filter) : wholeScopeCounts(id, scope),
      costPerItem(id),
      Promise.all(MEDIA_TYPES.map((type) => prisma.classification.count({ where: { apiKeyId: id, type,
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
