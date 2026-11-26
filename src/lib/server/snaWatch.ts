// Ad hoc SNA watches ("pantauan"): a named keyword set to see the network around one matter, e.g. "Listyo makar" =
// listyo, makar, sadap. Within a project it reads the project's posts that also match one of its keywords (users stay
// within their project); a whole-bank watch (admins) reads every post matching it.
import { NextResponse } from "next/server";
import { z } from "zod";
import { keywordProblem } from "@/lib/media/keywordExpr";
import { OPEN_SCOPE, type KeyScope } from "@/lib/media/keyScope";
import { accountsPerIssue, buildIssueGraph, type IssueAccountRow, type SnaDays, type SnaGraph, type SnaLimit } from "@/lib/sna";
import { sharedCache } from "./bank/cache";
import { REQUEST_TIMEOUT_MS, withLongTimeout } from "./bank/pool";
import { buildWhere, COLUMNS, scopeKey } from "./bank/query";
import { ENGAGEMENT, withAccountKinds, withCodes } from "./bank/sna";
import { prisma } from "./db";
import type { OverviewView } from "./overviewKey";
import type { SnaCodes } from "./snaFilter";

const keyword = z.string().trim().toLowerCase().min(2, "Kata kunci minimal 2 karakter").max(200, "Kata kunci maksimal 200 karakter")
  .superRefine((k, ctx) => { const p = keywordProblem(k); if (p) ctx.addIssue({ code: "custom", message: `Kata kunci "${k}": ${p}` }); });
export const watchInputSchema = z.object({
  key: z.string().trim().min(1).nullable().default(null),
  name: z.string().trim().min(2, "Nama minimal 2 karakter").max(60, "Nama maksimal 60 karakter"),
  keywords: z.array(keyword).min(1, "Isi minimal satu kata kunci").max(10, "Maksimal 10 kata kunci").transform((a) => [...new Set(a)]),
});

export type WatchRow = { id: string; apiKeyId: string | null; name: string; keywords: string[]; createdBy: string; createdAt: Date };

/**
 * The watch of ?watch= and the scope it reads, checked against the page's project: a project's watch only within that
 * project, a whole-bank watch only without one (users never get one: they always have a project). null when not asked.
 */
export async function resolveWatch(q: URLSearchParams, view: OverviewView): Promise<{ watch: WatchRow; scope: KeyScope } | null | Response> {
  const id = q.get("watch")?.trim();
  if (!id) return null;
  const watch = await prisma.snaWatch.findUnique({ where: { id } });
  if (!watch || watch.apiKeyId !== (view.key?.id ?? null)) return NextResponse.json({ error: "Pantauan tidak ditemukan di cakupan ini" }, { status: 404 });
  const scope: KeyScope = view.key && view.scope
    ? { ...view.scope, alsoKeywords: watch.keywords }
    : { ...OPEN_SCOPE, keywords: watch.keywords };
  return { watch, scope };
}

const cache = sharedCache<SnaGraph>("sna-watch", { ttlMs: 60_000, maxEntries: 50, staleWhileRevalidate: true });

/** Issue view of a watch: the watch as the one big node, the accounts posting about it (most engaging) around it. */
export function snaWatchGraph(watch: WatchRow, scope: KeyScope, days: SnaDays, limit: SnaLimit, only: SnaCodes): Promise<SnaGraph> {
  return cache(`${watch.id}|${days}|${limit}|${only?.key ?? ""}|${scopeKey(scope)}`, async () => {
    if (only && !only.codes.length) return { nodes: [], links: [] };
    const since = new Date(Date.now() - days * 86_400_000).toLocaleString("sv-SE", { timeZone: "Asia/Jakarta" });
    const { where, values } = withCodes(buildWhere("social", new URLSearchParams({ since }), scope), only);
    const { rows } = await withLongTimeout(REQUEST_TIMEOUT_MS, (pool) => pool.query<Omit<IssueAccountRow, "issue">>(
      `SELECT p.post_username username, min(p.post_source) source, lower(a.emotion) emotion, count(*)::int n, sum(${ENGAGEMENT})::float8 eng
       FROM ${COLUMNS.social.from} WHERE ${where} AND p.post_username <> '' GROUP BY 1, 3`, values));
    const posts = rows.reduce((s, r) => s + r.n, 0);
    const graph = buildIssueGraph([{ id: watch.id, title: watch.name, posts }], rows.map((r) => ({ ...r, issue: watch.id })), accountsPerIssue(limit) * 2);
    return withAccountKinds(graph);
  });
}
