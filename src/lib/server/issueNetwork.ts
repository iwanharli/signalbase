// Rows behind the full-screen network of one issue (see lib/issueNetwork.ts). Read-only on the source database.
import { mentionNetwork, newsOntology, onlineIssueNetwork, type IssueNewsRow } from "@/lib/issueNetwork";
import type { IssueSummary } from "@/lib/issues";
import { OPEN_SCOPE, type KeyScope } from "@/lib/media/keyScope";
import { sourceLabel } from "@/lib/media/labels";
import type { OntGraph } from "@/lib/ontology";
import { buildIssueGraph, type IssueAccountRow, type MentionPair, type SnaFlow, type SnaGraph, type SnaRow, type SnaView } from "@/lib/sna";
import { sharedCache } from "./bank/cache";
import { REQUEST_TIMEOUT_MS, withLongTimeout } from "./bank/pool";
import { buildWhere, COLUMNS, filterKey } from "./bank/query";
import { ENGAGEMENT, withAccountKinds } from "./bank/sna";

const socialCache = sharedCache<SnaGraph>("issue-network-social", { ttlMs: 5 * 60_000, maxEntries: 60, staleWhileRevalidate: true });
const onlineCache = sharedCache<{ sna: SnaGraph; ontology: OntGraph }>("issue-network-online", { ttlMs: 5 * 60_000, maxEntries: 60, staleWhileRevalidate: true });

/** The posts of a social issue: an early-warning alert's cluster in the source database (cluster_posts), or one of a
 *  project's own clusters (IssueCluster, its member post codes). */
export type SocialIssuePosts = { cluster: string } | { title: string; codes: string[] };

/** A social issue drawn as the SNA page draws a network, with every account (no limit):
 *  view "isu": the issue and the accounts posting in it, hung together by `flow` (langsung, mention, rantai, gelombang);
 *  view "mention": who mentions whom among those posts. */
export function socialIssueGraph(id: string, posts: SocialIssuePosts, scope: KeyScope = OPEN_SCOPE, view: SnaView = "isu", flow: SnaFlow = "langsung",
  labelled: { label: string; codes: string[] } | null = null) {
  const key = `${id}|${view}|${view === "isu" ? flow : ""}|${labelled?.label ?? ""}|${filterKey("social", new URLSearchParams(), scope)}`;
  return socialCache(key, () => withLongTimeout(REQUEST_TIMEOUT_MS, async (pool) => {
    const { where, values } = buildWhere("social", new URLSearchParams(), scope);
    const k = `$${values.length + 1}`;
    // Label filter: only the issue's posts carrying that label in the project.
    const inLabel = labelled ? ` AND p.post_code = ANY($${values.length + 2}::text[])` : "";
    const inIssue = ("cluster" in posts ? `p.id IN (SELECT post_id FROM cluster_posts WHERE cluster_id = ${k}::bigint)` : `p.post_code = ANY(${k}::text[])`) + inLabel;
    const args = [...values, "cluster" in posts ? posts.cluster : posts.codes, ...(labelled ? [labelled.codes] : [])];
    // One client: the queries run one after another (pg does not allow overlapping queries on a client).
    const title = "cluster" in posts
      ? (await pool.query<{ title: string | null }>(
        `SELECT alert_data->>'alert_title' title FROM alerts WHERE cluster_id = $1::bigint ORDER BY created_at DESC LIMIT 1`, [posts.cluster])).rows[0]?.title ?? `Isu ${posts.cluster}`
      : posts.title;
    const { rows: accounts } = await pool.query<Omit<IssueAccountRow, "issue">>(
      `SELECT p.post_username username, min(p.post_source) source, lower(a.emotion) emotion, count(*)::int n, sum(${ENGAGEMENT})::float8 eng,
              to_char(min(p.post_timestamps), 'YYYY-MM-DD"T"HH24:MI:SS') first
       FROM ${COLUMNS.social.from} WHERE ${where} AND ${inIssue} AND p.post_username <> '' GROUP BY 1, 3`, args);
    if (view === "mention") {
      const { rows } = await pool.query<SnaRow>(
        `SELECT p.post_username hub, m.username_target target, lower(a.emotion) emotion, count(*)::int n, sum(${ENGAGEMENT})::float8 eng
         FROM ${COLUMNS.social.from} JOIN post_mentioned m ON m.post_code = p.post_code
         WHERE ${where} AND ${inIssue} AND p.post_username <> '' AND m.username_target <> p.post_username GROUP BY 1, 2, 3`, args);
      return withAccountKinds(mentionNetwork(accounts, rows));
    }
    const pairs = flow === "mention" ? (await pool.query<Omit<MentionPair, "issue">>(
      `SELECT DISTINCT p.post_username source, m.username_target target FROM ${COLUMNS.social.from} JOIN post_mentioned m ON m.post_code = p.post_code
       WHERE ${where} AND ${inIssue} AND p.post_username <> '' AND m.username_target <> p.post_username`, args)).rows : [];
    const total = accounts.reduce((sum, r) => sum + r.n, 0);
    return withAccountKinds(buildIssueGraph([{ id, title, posts: total }], accounts.map((r) => ({ ...r, issue: id })), Number.MAX_SAFE_INTEGER,
      flow, pairs.map((p) => ({ ...p, issue: id }))));
  }));
}

/** A news issue: its outlets and journalists (with the tone of their articles), and the topics and provinces of its news. */
export function onlineIssueGraph(issue: IssueSummary, labelled: { label: string; codes: string[] } | null = null) {
  return onlineCache(`${issue.id}|${labelled?.label ?? ""}`, () => withLongTimeout(REQUEST_TIMEOUT_MS, async (pool) => {
    // Label filter: only the issue's news carrying that label in the project.
    const items = `news_issue_items nii JOIN news_main nm ON nm.news_code = nii.news_code${labelled ? " AND nm.news_code = ANY($2::text[])" : ""}`;
    const args = [issue.id, ...(labelled ? [labelled.codes] : [])];
    const rows = await pool.query<IssueNewsRow>(
        `SELECT nm.news_source source, nm.news_author author, lower(na.sentiment) sentiment, count(*)::int n
         FROM ${items} LEFT JOIN news_analyses na ON na.news_code = nm.news_code WHERE nii.issue_id = $1::bigint GROUP BY 1, 2, 3`, args);
    const topics = await pool.query<{ name: string; n: number }>(
        `SELECT t.item name, count(DISTINCT nm.news_code)::int n FROM ${items} JOIN news_analyses na ON na.news_code = nm.news_code
         CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(na.topics->'items') = 'array' THEN na.topics->'items' ELSE '[]'::jsonb END) t(item)
         WHERE nii.issue_id = $1::bigint AND t.item <> '' GROUP BY 1 ORDER BY 2 DESC`, args);
    const regions = await pool.query<{ name: string; n: number }>(
        `SELECT pr.name, count(*)::int n FROM ${items} JOIN region_indonesia_provinces pr ON pr.province_code = nm.region_code
         WHERE nii.issue_id = $1::bigint GROUP BY 1 ORDER BY 2 DESC`, args);
    const title = issue.label || issue.title;
    const topicNames = topics.rows.map((t) => ({ name: t.name.charAt(0).toUpperCase() + t.name.slice(1), n: t.n }));
    return {
      sna: onlineIssueNetwork({ title }, rows.rows, sourceLabel),
      ontology: newsOntology({ id: issue.id, title, score: issue.score, newsCount: issue.newsCount }, topicNames, regions.rows),
    };
  }));
}
