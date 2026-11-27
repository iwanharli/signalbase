// The network of one issue, for the full-screen "Jaringan isu" view on the issue pages. Pure: the server fetches the rows,
// the browser draws the result with the Gephi map (components/sna/GephiGraph). No node limit: every account, outlet or
// entity of the issue is in it.
//   Social issue (early-warning cluster): the issue, every account that posted in it, and the accounts they mention.
//   Online issue (news cluster): the issue, the outlets that reported it, and their journalists.
//   Ontology: an issue with its actors and targets (social, plus the other issues naming them) or its topics and regions (online).
import { buildOntology, issueNodeId, entityId, type OntGraph, type OntIssue } from "./ontology";
import { buildGraph, dominantTone, toneOf, type SnaGraph, type SnaHub, type SnaLink, type SnaNode, type SnaRow, type Tone } from "./sna";

const emptyCounts = (): Record<Tone, number> => ({ negative: 0, neutral: 0, positive: 0, unknown: 0 });
export const ISSUE_NODE = "issue";

/** One account in a social issue, with the emotion of its posts in it. */
export type IssueAuthorRow = { username: string; source: string; emotion: string | null; n: number; eng: number };

/** Social issue: the issue node, every posting account linked to it (tone = emotions of its posts), and who they mention. */
export function socialIssueNetwork(issue: { title: string }, authors: IssueAuthorRow[], mentions: SnaRow[]): SnaGraph {
  const perAuthor = new Map<string, SnaHub & { counts: Record<Tone, number> }>();
  for (const r of authors) {
    const a = perAuthor.get(r.username) ?? { username: r.username, source: r.source, posts: 0, engagement: 0, counts: emptyCounts() };
    a.posts += r.n;
    a.engagement = (a.engagement ?? 0) + r.eng;
    a.counts[toneOf(r.emotion)] += r.n;
    perAuthor.set(r.username, a);
  }
  const hubs = [...perAuthor.values()];
  const mentionGraph = buildGraph(hubs, mentions, Number.MAX_SAFE_INTEGER);
  const posts = hubs.reduce((s, h) => s + h.posts, 0);
  const issueLinks: SnaLink[] = hubs.map((h) => ({ source: ISSUE_NODE, target: h.username, n: h.posts, tone: dominantTone(h.counts), counts: h.counts }));
  return {
    nodes: [{ id: ISSUE_NODE, kind: "issue", title: issue.title, posts, mentions: 0 }, ...mentionGraph.nodes],
    links: [...issueLinks, ...mentionGraph.links],
  };
}

/** One outlet + journalist pair of a news issue, with the tone of its articles (news sentiment). */
export type IssueNewsRow = { source: string; author: string | null; sentiment: string | null; n: number };
const SENTIMENT_TONE: Record<string, Tone> = { positive: "positive", neutral: "neutral", negative: "negative" };

/** Unhelpful bylines: the outlet itself, a social media page or a URL rather than a person. */
const personAuthor = (author: string | null, outletName: string) => {
  const a = author?.replace(/\s+/g, " ").trim() ?? "";
  if (!a || a === "-" || /^https?:|www\.|\.com\b|facebook|instagram|twitter/i.test(a)) return null;
  return a.toLowerCase() === outletName.toLowerCase() ? null : a;
};

/** Online issue: the issue node, every outlet that reported it (size = articles), and each outlet's journalists. */
export function onlineIssueNetwork(issue: { title: string }, rows: IssueNewsRow[], outletName: (source: string) => string): SnaGraph {
  const outlets = new Map<string, { counts: Record<Tone, number>; n: number }>();
  const pairs = new Map<string, { source: string; author: string; counts: Record<Tone, number>; n: number }>();
  for (const r of rows) {
    const tone = SENTIMENT_TONE[(r.sentiment ?? "").toLowerCase()] ?? "unknown";
    const o = outlets.get(r.source) ?? { counts: emptyCounts(), n: 0 };
    o.counts[tone] += r.n; o.n += r.n;
    outlets.set(r.source, o);
    const author = personAuthor(r.author, outletName(r.source));
    if (!author) continue;
    const key = `${r.source}\u0000${author.toLowerCase()}`;
    const p = pairs.get(key) ?? { source: r.source, author, counts: emptyCounts(), n: 0 };
    p.counts[tone] += r.n; p.n += r.n;
    pairs.set(key, p);
  }
  const outletId = (s: string) => `m:${s}`, authorId = (a: string) => `j:${a.toLowerCase()}`;
  const nodes: SnaNode[] = [{ id: ISSUE_NODE, kind: "issue", title: issue.title, posts: [...outlets.values()].reduce((s, o) => s + o.n, 0), mentions: 0 }];
  const links: SnaLink[] = [];
  for (const [source, o] of outlets) {
    nodes.push({ id: outletId(source), kind: "hub", name: outletName(source), posts: o.n, mentions: 0, engagement: o.n, account: "media" });
    links.push({ source: ISSUE_NODE, target: outletId(source), n: o.n, tone: dominantTone(o.counts), counts: o.counts });
  }
  const journalists = new Map<string, SnaNode>();
  for (const p of pairs.values()) {
    const id = authorId(p.author);
    const j = journalists.get(id) ?? { id, kind: "child", name: p.author, posts: 0, mentions: 0, engagement: 0 };
    j.posts += p.n; j.engagement = (j.engagement ?? 0) + p.n;
    journalists.set(id, j);
    links.push({ source: outletId(p.source), target: id, n: p.n, tone: dominantTone(p.counts), counts: p.counts });
  }
  return { nodes: [...nodes, ...journalists.values()], links };
}

/** Social issue ontology: the issue, its actors and targets, and the other issues (in the list) naming one of them. */
export function relatedOntology(issues: OntIssue[], id: string): OntGraph {
  const focus = issues.find((i) => i.id === id);
  if (!focus) return { nodes: [], links: [] };
  const names = new Set([...focus.actors, ...focus.targets].map((n) => entityId(n)));
  const related = issues.filter((i) => i.id === id || [...i.actors, ...i.targets].some((n) => names.has(entityId(n))));
  return buildOntology([focus, ...related.filter((i) => i.id !== id)]);
}

/** Online issue ontology: the issue with the topics (as actors) and regions (as targets) of its news; weight = articles. */
export function newsOntology(issue: { id: string; title: string; score: number; newsCount: number }, topics: { name: string; n: number }[], regions: { name: string; n: number }[]): OntGraph {
  const iid = issueNodeId(issue.id);
  const graph: OntGraph = { nodes: [{ id: iid, kind: "issue", label: issue.title, score: issue.score, count: issue.newsCount, asActor: 0, asTarget: 0 }], links: [] };
  for (const [list, kind] of [[topics, "actor"], [regions, "target"]] as const) {
    for (const t of list) {
      const id = `${kind === "actor" ? "t" : "r"}:${t.name.toLowerCase()}`;
      graph.nodes.push({ id, kind, label: t.name, score: 0, count: t.n, asActor: kind === "actor" ? t.n : 0, asTarget: kind === "target" ? t.n : 0 });
      graph.links.push(kind === "actor" ? { source: id, target: iid, role: "actor" } : { source: iid, target: id, role: "target" });
    }
  }
  return graph;
}

/** An ontology as a Gephi map: issues stay issues, actors become main nodes and targets their neighbours. Edges take
 *  the role as tone, so "emosi" colouring would mislead; the view colours ontologies by node type ("jenis") instead. */
export function ontologyAsSna(g: OntGraph): SnaGraph {
  const tone: Record<"actor" | "target", Tone> = { actor: "positive", target: "neutral" };
  return {
    nodes: g.nodes.map((n): SnaNode => n.kind === "issue"
      ? { id: n.id, kind: "issue", title: n.label, posts: Math.max(1, n.count), mentions: 0 }
      : { id: n.id, kind: n.kind === "actor" ? "hub" : "child", name: n.label, posts: n.count, mentions: n.count, engagement: n.count }),
    links: g.links.map((l): SnaLink => {
      const counts = emptyCounts();
      counts[tone[l.role]] = 1;
      return { source: l.source, target: l.target, n: 1, tone: tone[l.role], counts };
    }),
  };
}
