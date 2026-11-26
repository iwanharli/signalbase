// Network measures of an SNA graph, shared by the Gephi view, the bridge list and the account panel (browser side; the
// graphs are at most a few hundred nodes, a few milliseconds of work):
// - communities: Louvain on the undirected graph, weighted by how many posts/mentions join two nodes;
// - betweenness: how often a node lies on the shortest paths between other nodes (Brandes), normalised 0–1. Frequent
//   contact means close, so the distance of a link is 1 / its weight. A high score marks a bridge between groups.
// The scores are relative to the graph on screen (a sample: the top accounts of the period), not the whole platform.
import Graph from "graphology";
import louvain from "graphology-communities-louvain";
import betweennessCentrality from "graphology-metrics/centrality/betweenness";
import type { SnaGraph } from "./sna";

export type Bridge = { id: string; score: number; rank: number; communities: number[] };
export type NetworkAnalysis = {
  community: Map<string, number>;
  betweenness: Map<string, number>;
  /** Accounts (not issues) by betweenness, highest first; only those on some shortest path (score > 0). */
  bridges: Bridge[];
  /** Accounts in the graph (issue nodes left out), the "of N" of a rank. */
  accounts: number;
};

/** Small seeded random numbers, so the same graph always gets the same communities. */
export function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

/** The graph's links merged into one undirected weighted edge per pair (`weight`: posts or mentions, `distance`: 1 / weight). */
export function undirected(g: SnaGraph) {
  const graph = new Graph({ type: "undirected", multi: false });
  for (const n of g.nodes) graph.addNode(n.id);
  for (const l of g.links) {
    if (!graph.hasNode(l.source) || !graph.hasNode(l.target) || l.source === l.target) continue;
    const key = l.source < l.target ? `${l.source}\u0000${l.target}` : `${l.target}\u0000${l.source}`;
    const weight = (graph.hasEdge(key) ? (graph.getEdgeAttribute(key, "weight") as number) : 0) + Math.max(1, l.n);
    graph.mergeEdgeWithKey(key, l.source, l.target, { weight, distance: 1 / weight });
  }
  return graph;
}

export function analyzeNetwork(g: SnaGraph): NetworkAnalysis {
  const graph = undirected(g);
  const community = new Map<string, number>();
  if (graph.size) for (const [id, c] of Object.entries(louvain(graph, { getEdgeWeight: "weight", rng: seeded(42) }))) community.set(id, c);
  const betweenness = new Map<string, number>(Object.entries(graph.order > 2 ? betweennessCentrality(graph, { getEdgeWeight: "distance", normalized: true }) : {}));
  const isAccount = new Set(g.nodes.filter((n) => n.kind !== "issue").map((n) => n.id));
  const bridges = [...betweenness]
    .filter(([id, score]) => isAccount.has(id) && score > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id, score], i): Bridge => {
      // The communities it joins: its own and those of its neighbours.
      const joined = new Set<number>([community.get(id) ?? -1]);
      graph.forEachNeighbor(id, (nb) => joined.add(community.get(nb) ?? -1));
      joined.delete(-1);
      return { id, score, rank: i + 1, communities: [...joined] };
    });
  return { community, betweenness, bridges, accounts: isAccount.size };
}
