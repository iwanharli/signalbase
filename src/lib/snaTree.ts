// "Susun pohon" of the SNA issue view: the issues in the first row (most posts first), under each issue the accounts tied
// to it, directly or through other accounts, as a tree (an account under the node nearest to an issue it links with),
// accounts without children packed in a small grid under their parent so wide issues stay compact. Only accounts with no
// path at all to an issue form a grid below everything. Positions in pixels, centred on x = 0.
import type { SnaGraph, SnaNode } from "./sna";

export type TreeLayout = { pos: Map<string, { x: number; y: number }>; orphans: Set<string>; width: number; height: number };

/** Spacing in pixels: `unit` horizontal room per account, `level` from a node to its children, `row` between rows of a
 *  packed leaf grid. The classic view draws bigger nodes (icons, labels) than the Gephi view, so it asks for more room. */
export type TreeSpacing = { unit: number; level: number; row: number };
export const TREE_COMPACT: TreeSpacing = { unit: 66, level: 150, row: 70 };
export const TREE_ROOMY: TreeSpacing = { unit: 92, level: 190, row: 96 };
const LEAF_COLS = 3; // leaf grid columns under one parent (narrow and tall fits the wide row of issues better)
const ISSUE_MIN = 3; // an issue keeps room for its title even with few accounts
const GAP = 0.6; // units between issues

/** null when the graph has no issue (the mention view). */
export function treeLayout(g: SnaGraph, { unit: UNIT, level: LEVEL, row: ROW }: TreeSpacing = TREE_COMPACT): TreeLayout | null {
  const issues = g.nodes.filter((n) => n.kind === "issue").sort((a, b) => b.posts - a.posts || a.id.localeCompare(b.id));
  if (!issues.length) return null;
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  // Links followed both ways: an account is in a tree as soon as it has any path to an issue (e.g. it links to an account
  // of another issue whose own link to that issue was hidden), not only when it points at its parent.
  const neighbours = new Map<string, string[]>();
  for (const l of g.links) {
    neighbours.set(l.target, [...(neighbours.get(l.target) ?? []), l.source]);
    neighbours.set(l.source, [...(neighbours.get(l.source) ?? []), l.target]);
  }
  const order = (a: SnaNode, b: SnaNode) => (a.first && b.first && a.first !== b.first ? (a.first < b.first ? -1 : 1) : 0)
    || (b.engagement ?? b.posts) - (a.engagement ?? a.posts) || a.id.localeCompare(b.id);

  // Breadth first from all issues at once: an account goes under the issue or account it is first reached from (the
  // nearest to an issue); an account in several issues under the first.
  const kids = new Map<string, string[]>();
  const seen = new Set<string>(issues.map((i) => i.id));
  let level = issues.map((i) => i.id);
  while (level.length) {
    const next: string[] = [];
    for (const u of level) {
      const found = [...new Set(neighbours.get(u) ?? [])].map((id) => byId.get(id)).filter((n): n is SnaNode => !!n && n.kind !== "issue" && !seen.has(n.id)).sort(order);
      for (const n of found) seen.add(n.id);
      kids.set(u, found.map((n) => n.id));
      next.push(...found.map((n) => n.id));
    }
    level = next;
  }

  const widths = new Map<string, number>();
  const split = (u: string) => { const k = kids.get(u) ?? []; return { inner: k.filter((c) => kids.get(c)?.length), leaves: k.filter((c) => !kids.get(c)?.length) }; };
  const width = (u: string): number => {
    const known = widths.get(u);
    if (known !== undefined) return known;
    const { inner, leaves } = split(u);
    const w = Math.max(byId.get(u)?.kind === "issue" ? ISSUE_MIN : 1, inner.reduce((s, c) => s + width(c), 0) + Math.min(LEAF_COLS, leaves.length));
    widths.set(u, w);
    return w;
  };

  const pos = new Map<string, { x: number; y: number }>();
  let bottom = 0;
  const place = (u: string, left: number, y: number) => {
    const w = width(u);
    pos.set(u, { x: (left + w / 2) * UNIT, y });
    bottom = Math.max(bottom, y);
    const { inner, leaves } = split(u);
    const cols = Math.min(LEAF_COLS, leaves.length);
    let cursor = left + (w - (inner.reduce((s, c) => s + width(c), 0) + cols)) / 2;
    for (const c of inner) { place(c, cursor, y + LEVEL); cursor += width(c); }
    leaves.forEach((c, i) => {
      const ly = y + LEVEL + Math.floor(i / cols) * ROW;
      pos.set(c, { x: (cursor + (i % cols) + 0.5) * UNIT, y: ly });
      bottom = Math.max(bottom, ly);
    });
  };
  let left = 0;
  for (const issue of issues) { place(issue.id, left, 0); left += width(issue.id) + GAP; }
  const total = Math.max(1, left - GAP);

  // Not tied to an issue: a grid under the trees, as wide as they are.
  const orphans = new Set(g.nodes.filter((n) => !seen.has(n.id)).map((n) => n.id));
  const cols = Math.max(6, Math.floor(total));
  const loose = g.nodes.filter((n) => orphans.has(n.id)).sort(order);
  const top = bottom + LEVEL * 1.3;
  loose.forEach((n, i) => {
    const row = Math.floor(i / cols), inRow = Math.min(cols, loose.length - row * cols);
    pos.set(n.id, { x: ((total - inRow) / 2 + (i % cols) + 0.5) * UNIT, y: top + row * ROW });
    bottom = Math.max(bottom, top + row * ROW);
  });

  const mid = (total * UNIT) / 2;
  for (const p of pos.values()) p.x -= mid;
  return { pos, orphans, width: total * UNIT, height: bottom };
}

/** The graph without the given nodes and their links. */
export function withoutNodes(g: SnaGraph, ids: Set<string>): SnaGraph {
  if (!ids.size) return g;
  return { nodes: g.nodes.filter((n) => !ids.has(n.id)), links: g.links.filter((l) => !ids.has(l.source) && !ids.has(l.target)) };
}
