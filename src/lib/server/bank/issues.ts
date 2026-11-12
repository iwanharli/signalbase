import { ISSUE_NEWS_PAGE, ISSUES_LIMIT, titleFilter, topicTerms, type IssueDays, type IssueTopic, type IssueNews, type IssueSource, type IssueSummary } from "@/lib/issues";
import { sharedCache } from "./cache";
import { bankPool } from "./pool";

// News issues (clusters of related online news) from the source database. `keywords` limits them to issues whose
// title mentions one of them (a project's view); empty = every issue (admin overview). `topic` narrows further (Isu Polisi).
const listCache = sharedCache<IssueSummary[]>("issues", { ttlMs: 60_000, staleWhileRevalidate: true });

type IssueRow = { id: string; title: string; label: string | null; news_count: number; first_seen_at: Date; last_seen_at: Date; score: number; status: string };
// news_issues.news_count drifts from the linked items (355 vs 42 seen), so the count comes from news_issue_items. As a select-list subquery it runs only for the rows that survive LIMIT.
const SELECT = `SELECT ni.id::text id, ni.title, ni.label, (SELECT count(*)::int FROM news_issue_items c WHERE c.issue_id = ni.id) news_count, ni.first_seen_at, ni.last_seen_at, ni.score, ni.status FROM news_issues ni`;

// Timestamps are stored without a zone; they are read the same way as news_timestamp in items.ts.
const toIssue = (r: IssueRow): IssueSummary => ({
  id: r.id, title: r.title, label: r.label, newsCount: r.news_count, score: r.score, active: r.status === "active",
  firstSeenAt: new Date(r.first_seen_at).toISOString(), lastSeenAt: new Date(r.last_seen_at).toISOString(),
});

/** The highest-scoring issues seen within the last `days` days. */
export function listIssues(days: IssueDays, keywords: string[], topic: IssueTopic) {
  return listCache(`${days}|${topic}|${keywords.join("\u0001")}`, async () => {
    const filter = titleFilter(keywords, 2, topicTerms(topic));
    const { rows } = await bankPool().query<IssueRow>(
      `${SELECT} WHERE ${filter.sql} AND ni.last_seen_at >= CURRENT_DATE - ($1::int * INTERVAL '1 day') ORDER BY ni.score DESC LIMIT ${ISSUES_LIMIT}`,
      [days, ...filter.params],
    );
    return rows.map(toIssue);
  });
}

/** One issue, or null when it does not exist or is outside the keywords' and topic's view (so an id alone never opens another project's issue). */
export async function findIssue(id: string, keywords: string[], topic: IssueTopic) {
  const filter = titleFilter(keywords, 2, topicTerms(topic));
  const { rows } = await bankPool().query<IssueRow>(`${SELECT} WHERE ni.id = $1::bigint AND ${filter.sql}`, [id, ...filter.params]);
  return rows[0] ? toIssue(rows[0]) : null;
}

type NewsRow = { code: string; source: string; url: string | null; author: string | null; title: string; preview: string | null; ts: Date; image: string | null; category: string | null; province: string | null };

/** News of an issue, newest first. Page 1 also returns the busiest sources; `source` narrows to one. */
export async function issueNews(id: string, page: number, source: string | null) {
  const pool = bankPool();
  const from = `FROM news_issue_items nii JOIN news_main nm ON nii.news_code = nm.news_code`;
  const params: unknown[] = [id];
  let where = "nii.issue_id = $1::bigint";
  if (source) { params.push(source); where += ` AND nm.news_source = $${params.length}`; }
  const [news, sources] = await Promise.all([
    pool.query<NewsRow>(
      `SELECT nm.news_code code, nm.news_source source, nm.news_url url, nm.news_author author, nm.news_title title, nm.news_preview preview,
        nm.news_timestamp ts, nm.news_image image, nm.news_category_label category, pr.name province
       ${from} LEFT JOIN region_indonesia_provinces pr ON pr.province_code = nm.region_code
       WHERE ${where} ORDER BY nm.news_timestamp DESC LIMIT ${ISSUE_NEWS_PAGE + 1} OFFSET ${(page - 1) * ISSUE_NEWS_PAGE}`,
      params,
    ),
    page === 1 && !source
      ? pool.query<{ source: string; count: number }>(`SELECT nm.news_source source, count(*)::int count ${from} WHERE nii.issue_id = $1::bigint GROUP BY 1 ORDER BY 2 DESC LIMIT 10`, [id])
      : Promise.resolve(null),
  ]);
  const items: IssueNews[] = news.rows.slice(0, ISSUE_NEWS_PAGE).map((r) => ({
    code: r.code, source: r.source, url: r.url, author: r.author, title: r.title, preview: r.preview,
    publishedAt: new Date(r.ts).toISOString(), image: r.image, category: r.category, province: r.province,
  }));
  return { items, hasMore: news.rows.length > ISSUE_NEWS_PAGE, sources: (sources?.rows ?? null) as IssueSource[] | null };
}
