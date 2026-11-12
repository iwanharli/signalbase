import assert from "node:assert/strict";
import { test } from "node:test";
import { buildGraph, dominantTone, emptyHubs, parseSnaDays, toneOf } from "../src/lib/sna";

test("only 1, 3 and 7 days are accepted, and 1 day is the default", () => {
  assert.equal(parseSnaDays(null), 1);
  for (const d of [1, 3, 7]) assert.equal(parseSnaDays(String(d)), d);
  for (const bad of ["", "0", "2", "14", "1; DROP", "-1"]) assert.equal(parseSnaDays(bad), null);
});

test("emotions map to the three line colours, unlabelled ones stay grey", () => {
  for (const e of ["marah", "menolak", "Kecewa", "sarkasme"]) assert.equal(toneOf(e), "negative");
  assert.equal(toneOf("netral"), "neutral");
  for (const e of ["mendukung", "puas", "dukungan"]) assert.equal(toneOf(e), "positive");
  assert.equal(toneOf(null), "unknown");
  assert.equal(toneOf("aneh"), "unknown");
});

test("dominant tone: most mentions wins, ties go negative first, a known tone beats unknown", () => {
  const c = (negative: number, neutral: number, positive: number, unknown: number) => ({ negative, neutral, positive, unknown });
  assert.equal(dominantTone(c(1, 5, 2, 0)), "neutral");
  assert.equal(dominantTone(c(2, 0, 2, 0)), "negative");
  assert.equal(dominantTone(c(0, 0, 1, 9)), "positive");
  assert.equal(dominantTone(c(0, 0, 0, 3)), "unknown");
});

test("graph: mentions of one pair are merged with their emotion split, hubs stay single nodes, children are capped per hub", () => {
  const hubs = [{ username: "a", source: "twitter", posts: 10 }, { username: "b", source: "instagram", posts: 4 }];
  const rows = [
    { hub: "a", target: "x", emotion: "marah", n: 2 },
    { hub: "a", target: "x", emotion: "netral", n: 1 },
    { hub: "a", target: "b", emotion: "puas", n: 3 },
    { hub: "a", target: "y", emotion: null, n: 1 },
    { hub: "a", target: "a", emotion: "netral", n: 9 }, // self mention is ignored
    { hub: "zzz", target: "x", emotion: "netral", n: 9 }, // not a hub
  ];
  const g = buildGraph(hubs, rows, 2);
  assert.deepEqual(g.links.map((l) => [l.source, l.target, l.n, l.tone]), [["a", "b", 3, "positive"], ["a", "x", 3, "negative"]]);
  assert.equal(g.links[1].counts.neutral, 1);
  assert.deepEqual(g.nodes.map((n) => [n.id, n.kind]), [["a", "hub"], ["b", "hub"], ["x", "child"]]);
  assert.equal(g.nodes.find((n) => n.id === "a")!.mentions, 6);
  assert.deepEqual(emptyHubs(), { nodes: [], links: [] });
});

test("only the offered limits are accepted, 25 is the default, and fewer hubs keep more children each", async () => {
  const { parseSnaLimit, childrenPerHub } = await import("../src/lib/sna");
  assert.equal(parseSnaLimit(null), 25);
  for (const n of [25, 50, 100, 200]) assert.equal(parseSnaLimit(String(n)), n);
  for (const bad of ["", "0", "30", "500", "25; DROP TABLE x"]) assert.equal(parseSnaLimit(bad), null);
  assert.ok(childrenPerHub(25) > childrenPerHub(200) && childrenPerHub(200) >= 3);
});

test("node counts sum a hub's outgoing and a child's incoming emotion counts", async () => {
  const { nodeCounts, buildGraph } = await import("../src/lib/sna");
  const g = buildGraph([{ username: "a", source: "x", posts: 5 }, { username: "b", source: "x", posts: 3 }], [
    { hub: "a", target: "c", emotion: "marah", n: 2 }, { hub: "b", target: "c", emotion: "puas", n: 1 }, { hub: "a", target: "d", emotion: "netral", n: 4 },
  ]);
  assert.deepEqual(nodeCounts(g.links, "a", "hub"), { negative: 2, neutral: 4, positive: 0, unknown: 0 });
  assert.deepEqual(nodeCounts(g.links, "c", "child"), { negative: 2, neutral: 0, positive: 1, unknown: 0 });
});
