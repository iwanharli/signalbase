// SNA issue view: the project's issues (IssueCluster) as big nodes, the accounts posting in each around them, sized by the
// engagement of their posts. One query over the issues' post codes; cached a minute like the mention graph.
import { accountsPerIssue, buildIssueGraph, emptyHubs, ISSUES_SHOWN, type IssueAccountRow, type SnaDays, type SnaGraph, type SnaLimit } from "@/lib/sna";
import { sharedCache } from "../bank/cache";
import { analyticsPool } from "../bank/pool";
import { ENGAGEMENT } from "../bank/sna";
import { prisma } from "../db";
import type { SnaCodes } from "../snaFilter";

const cache = sharedCache<SnaGraph>("sna-isu", { ttlMs: 60_000, maxEntries: 50, staleWhileRevalidate: true });

/** `issueId`: only that issue; `only`: posts limited further (label filter, already intersected with the issue's posts). */
export async function snaIssueGraph(keyId: string, days: SnaDays, limit: SnaLimit, only: SnaCodes, issueId: string | null): Promise<SnaGraph> {
  const issues = await prisma.issueCluster.findMany({
    where: { apiKeyId: keyId, active: true, ...(issueId ? { id: issueId } : {}) },
    orderBy: { score: "desc" }, take: issueId ? 1 : ISSUES_SHOWN,
    select: { id: true, title: true, keywords: true, posts: true, codes: true, updatedAt: true },
  });
  if (!issues.length) return emptyHubs();
  const stamp = issues.map((i) => `${i.id}:${i.updatedAt.getTime()}`).join(",");
  return cache(`${keyId}|${days}|${limit}|${only?.key ?? ""}|${stamp}`, async () => {
    const allowed = only ? new Set(only.codes) : null;
    const ids: string[] = [], codes: string[] = [];
    for (const i of issues) for (const c of i.codes) if (!allowed || allowed.has(c)) { ids.push(i.id); codes.push(c); }
    if (!codes.length) return emptyHubs();
    const since = new Date(Date.now() - days * 86_400_000).toLocaleString("sv-SE", { timeZone: "Asia/Jakarta" });
    const { rows } = await analyticsPool().query<IssueAccountRow>(
      `SELECT i.issue, p.post_username username, min(p.post_source) source, lower(a.emotion) emotion, count(*)::int n, sum(${ENGAGEMENT})::float8 eng
       FROM unnest($1::text[], $2::text[]) i(issue, code)
       JOIN post_main p ON p.post_code = i.code LEFT JOIN post_analyses a ON a.post_id = p.id
       WHERE p.post_username <> '' AND p.post_timestamps >= $3::timestamp
       GROUP BY 1, 2, 4`, [ids, codes, since]);
    const shown = issues.map((i) => ({ id: i.id, title: i.title ?? i.keywords.slice(0, 4).join(", "), posts: i.posts }));
    return buildIssueGraph(shown, rows, accountsPerIssue(limit));
  });
}
