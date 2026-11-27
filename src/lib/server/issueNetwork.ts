// Rows behind the full-screen network of one issue (see lib/issueNetwork.ts). Read-only on the source database.
import { newsOntology, onlineIssueNetwork, socialIssueNetwork, type IssueAuthorRow, type IssueNewsRow } from "@/lib/issueNetwork";
import type { IssueSummary } from "@/lib/issues";
import { OPEN_SCOPE, type KeyScope } from "@/lib/media/keyScope";
import { sourceLabel } from "@/lib/media/labels";
import type { OntGraph } from "@/lib/ontology";
import type { SnaGraph, SnaRow } from "@/lib/sna";
import { sharedCache } from "./bank/cache";
import { REQUEST_TIMEOUT_MS, withLongTimeout } from "./bank/pool";
import { buildWhere, COLUMNS, filterKey } from "./bank/query";
import { ENGAGEMENT, withAccountKinds } from "./bank/sna";

const socialCache = sharedCache<SnaGraph>("issue-network-social", { ttlMs: 5 * 60_000, maxEntries: 60, staleWhileRevalidate: true });
const onlineCache = sharedCache<{ sna: SnaGraph; ontology: OntGraph }>("issue-network-online", { ttlMs: 5 * 60_000, maxEntries: 60, staleWhileRevalidate: true });

/** Every post of an early-warning cluster (cluster_posts) within the scope: its accounts and whom they mention. */
export function socialIssueGraph(clusterId: string, scope: KeyScope = OPEN_SCOPE) {
  return socialCache(`${clusterId}|${filterKey("social", new URLSearchParams(), scope)}`, () => withLongTimeout(REQUEST_TIMEOUT_MS, async (pool) => {
    const { where, values } = buildWhere("social", new URLSearchParams(), scope);
    const k = `$${values.length + 1}`;
    const inCluster = `p.id IN (SELECT post_id FROM cluster_posts WHERE cluster_id = ${k}::bigint)`;
    const args = [...values, clusterId];
    // One client: the queries run one after another (pg does not allow overlapping queries on a client).
    const title = await pool.query<{ title: string | null }>(`SELECT alert_data->>'alert_title' title FROM alerts WHERE cluster_id = $1::bigint ORDER BY created_at DESC LIMIT 1`, [clusterId]);
    const authors = await pool.query<IssueAuthorRow>(
        `SELECT p.post_username username, min(p.post_source) source, lower(a.emotion) emotion, count(*)::int n, sum(${ENGAGEMENT})::float8 eng
         FROM ${COLUMNS.social.from} WHERE ${where} AND ${inCluster} AND p.post_username <> '' GROUP BY 1, 3`, args);
    const mentions = await pool.query<SnaRow>(
        `SELECT p.post_username hub, m.username_target target, lower(a.emotion) emotion, count(*)::int n, sum(${ENGAGEMENT})::float8 eng
         FROM ${COLUMNS.social.from} JOIN post_mentioned m ON m.post_code = p.post_code
         WHERE ${where} AND ${inCluster} AND p.post_username <> '' AND m.username_target <> p.post_username GROUP BY 1, 2, 3`, args);
    return withAccountKinds(socialIssueNetwork({ title: title.rows[0]?.title ?? `Isu ${clusterId}` }, authors.rows, mentions.rows));
  }));
}

/** A news issue: its outlets and journalists (with the tone of their articles), and the topics and provinces of its news. */
export function onlineIssueGraph(issue: IssueSummary) {
  return onlineCache(issue.id, () => withLongTimeout(REQUEST_TIMEOUT_MS, async (pool) => {
    const items = `news_issue_items nii JOIN news_main nm ON nm.news_code = nii.news_code`;
    const rows = await pool.query<IssueNewsRow>(
        `SELECT nm.news_source source, nm.news_author author, lower(na.sentiment) sentiment, count(*)::int n
         FROM ${items} LEFT JOIN news_analyses na ON na.news_code = nm.news_code WHERE nii.issue_id = $1::bigint GROUP BY 1, 2, 3`, [issue.id]);
    const topics = await pool.query<{ name: string; n: number }>(
        `SELECT t.item name, count(DISTINCT nm.news_code)::int n FROM ${items} JOIN news_analyses na ON na.news_code = nm.news_code
         CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(na.topics->'items') = 'array' THEN na.topics->'items' ELSE '[]'::jsonb END) t(item)
         WHERE nii.issue_id = $1::bigint AND t.item <> '' GROUP BY 1 ORDER BY 2 DESC`, [issue.id]);
    const regions = await pool.query<{ name: string; n: number }>(
        `SELECT pr.name, count(*)::int n FROM ${items} JOIN region_indonesia_provinces pr ON pr.province_code = nm.region_code
         WHERE nii.issue_id = $1::bigint GROUP BY 1 ORDER BY 2 DESC`, [issue.id]);
    const title = issue.label || issue.title;
    const topicNames = topics.rows.map((t) => ({ name: t.name.charAt(0).toUpperCase() + t.name.slice(1), n: t.n }));
    return {
      sna: onlineIssueNetwork({ title }, rows.rows, sourceLabel),
      ontology: newsOntology({ id: issue.id, title, score: issue.score, newsCount: issue.newsCount }, topicNames, regions.rows),
    };
  }));
}
