import assert from "node:assert/strict";
import { test } from "node:test";
import type { SnaGraph, SnaLink, SnaNode } from "../src/lib/sna";
import { treeLayout, withoutNodes } from "../src/lib/snaTree";

const node = (id: string, kind: SnaNode["kind"] = "hub", extra: Partial<SnaNode> = {}): SnaNode => ({ id, kind, posts: 1, mentions: 0, ...extra });
const link = (source: string, target: string): SnaLink => ({ source, target, n: 1, tone: "neutral", counts: { negative: 0, neutral: 1, positive: 0, unknown: 0 } });

// Two issues; a chain under the big one (a -> b -> c), one account under the small one, one account tied to no issue.
const g: SnaGraph = {
  nodes: [node("issue:kecil", "issue", { posts: 3 }), node("issue:besar", "issue", { posts: 50 }), node("a"), node("b"), node("c"), node("d"), node("lepas"), node("teman")],
  links: [link("a", "issue:besar"), link("b", "a"), link("c", "b"), link("d", "issue:kecil"), link("lepas", "teman")],
};

test("tree: issues on the first row, the largest on the left, children under their parent", () => {
  const t = treeLayout(g)!;
  const p = (id: string) => t.pos.get(id)!;
  assert.equal(p("issue:besar").y, 0);
  assert.equal(p("issue:kecil").y, 0);
  assert.ok(p("issue:besar").x < p("issue:kecil").x);
  assert.ok(p("issue:besar").y < p("a").y && p("a").y < p("b").y && p("b").y < p("c").y);
  assert.equal(p("a").x, p("issue:besar").x); // a single child sits under its parent
  assert.ok(p("d").y > 0);
});

test("tree: accounts tied to no issue go below every tree and can be hidden", () => {
  const t = treeLayout(g)!;
  assert.deepEqual([...t.orphans].sort(), ["lepas", "teman"]);
  const deepest = Math.max(...["a", "b", "c", "d"].map((id) => t.pos.get(id)!.y));
  assert.ok(t.pos.get("lepas")!.y > deepest && t.pos.get("teman")!.y > deepest);
  const shown = withoutNodes(g, t.orphans);
  assert.equal(shown.nodes.length, 6);
  assert.ok(!shown.links.some((l) => l.source === "lepas"));
});

test("tree: many leaf accounts under one issue are packed into a 3-column grid", () => {
  const many: SnaGraph = { nodes: [node("issue:x", "issue"), ...Array.from({ length: 12 }, (_, i) => node(`u${i}`))], links: Array.from({ length: 12 }, (_, i) => link(`u${i}`, "issue:x")) };
  const t = treeLayout(many)!;
  const rows = new Set(Array.from({ length: 12 }, (_, i) => t.pos.get(`u${i}`)!.y));
  assert.equal(rows.size, 4);
  assert.equal(t.orphans.size, 0);
});

test("tree: without issues (mention view) there is no tree layout", () => {
  assert.equal(treeLayout({ nodes: [node("a"), node("b")], links: [link("a", "b")] }), null);
});

test("tree: accounts linked to an issue indirectly (through another account, reversed edge) join the tree, not the bottom", () => {
  // "atas" belongs to the issue; "x" and "y" only link to it from the other side (atas -> x), and y hangs on x.
  const indirect: SnaGraph = {
    nodes: [node("issue:i", "issue"), node("atas"), node("x"), node("y"), node("sendiri"), node("kawan")],
    links: [link("atas", "issue:i"), link("atas", "x"), link("y", "x"), link("sendiri", "kawan")],
  };
  const t = treeLayout(indirect)!;
  assert.deepEqual([...t.orphans].sort(), ["kawan", "sendiri"]);
  const p = (id: string) => t.pos.get(id)!;
  assert.ok(p("issue:i").y < p("atas").y && p("atas").y < p("x").y && p("x").y < p("y").y);
  assert.ok(p("sendiri").y > p("y").y);
});
