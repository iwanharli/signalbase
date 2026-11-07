import { NextResponse } from "next/server";
import { allowsType, parseKeyScope } from "@/lib/media/keyScope";
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
      Promise.all(MEDIA_TYPES.map(async (type) => [type, allowsType(scope, type) ? await countExact(type, filter, scope) : null] as const)),
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
