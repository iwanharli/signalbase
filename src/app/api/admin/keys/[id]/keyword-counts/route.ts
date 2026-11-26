import { NextResponse } from "next/server";
import { allowsType, parseKeyScope, type KeyScope } from "@/lib/media/keyScope";
import { MEDIA_TYPES, type MediaType } from "@/lib/media/types";
import { adminRoute } from "@/lib/server/auth";
import { createCache } from "@/lib/server/bank/cache";
import { REQUEST_TIMEOUT_MS, withLongTimeout } from "@/lib/server/bank/pool";
import { buildWhere, COLUMNS, keywordQuery } from "@/lib/server/bank/query";
import { prisma } from "@/lib/server/db";

const RANGES = [7, 30, 90] as const;
type Counts = { keyword: string; social: number | null; online: number | null }[];

// Counting a broad keyword reads many posts (seconds), so results are kept 10 minutes and refreshed in the background.
const cache = createCache<{ keywords: Counts; total: Record<MediaType, number | null> }>({ ttlMs: 10 * 60_000, staleWhileRevalidate: true });

/** First day of the last `days` days (Jakarta), as YYYY-MM-DD for the `from` filter. */
const fromDay = (days: number) => new Date(Date.now() - (days - 1) * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

/** One scan per media type over the posts matching any keyword; each keyword is a FILTER count on that scan. */
async function countType(type: MediaType, scope: KeyScope, from: string) {
  const c = COLUMNS[type];
  const { where, values } = buildWhere(type, new URLSearchParams({ from }), scope);
  const columns = scope.keywords.map((k) => {
    const q = keywordQuery([k]);
    if (!q) return "NULL::int";
    values.push(q);
    return `count(*) FILTER (WHERE ${c.search} @@ to_tsquery('indonesian', $${values.length}))::int`;
  });
  const { rows } = await withLongTimeout(REQUEST_TIMEOUT_MS, (client) => client.query<{ counts: (number | null)[]; total: number }>(
    `SELECT ARRAY[${columns.join(", ") || "NULL::int"}] counts, count(*)::int total FROM ${c.from} WHERE ${where}`, values));
  return rows[0];
}

type Context = { params: Promise<{ id: string }> };

// Posts and news per keyword of a project over the last 7, 30 or 90 days (?days=, default 30), within the project's other
// restrictions. Items that match only through the text in their image are left out of the per-keyword numbers.
export const GET = adminRoute(async (req: Request, { params }: Context) => {
  const { id } = await params;
  const asked = Number(new URL(req.url).searchParams.get("days"));
  const days = RANGES.includes(asked as (typeof RANGES)[number]) ? asked : 30;
  const key = await prisma.apiKey.findUnique({ where: { id }, select: { scope: true, keywords: true } });
  if (!key) return NextResponse.json({ error: "Proyek tidak ditemukan" }, { status: 404 });
  const scope = parseKeyScope(key.scope, key.keywords);
  if (!scope.keywords.length) return NextResponse.json({ days, keywords: [], total: { social: null, online: null } });
  const from = fromDay(days);
  try {
    const result = await cache(`${id}|${days}|${from}|${JSON.stringify(scope)}`, async () => {
      const byType = await Promise.all(MEDIA_TYPES.map((t) => (allowsType(scope, t) ? countType(t, scope, from) : Promise.resolve(null))));
      const at = (t: MediaType) => byType[MEDIA_TYPES.indexOf(t)];
      return {
        keywords: scope.keywords.map((keyword, i) => ({ keyword, social: at("social")?.counts[i] ?? null, online: at("online")?.counts[i] ?? null })),
        total: { social: at("social")?.total ?? null, online: at("online")?.total ?? null },
      };
    });
    return NextResponse.json({ days, from, ...result });
  } catch {
    return NextResponse.json({ error: "Jumlah post belum bisa dihitung" }, { status: 502 });
  }
});
