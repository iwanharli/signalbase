import assert from "node:assert/strict";
import { test } from "node:test";
import type { SnaGraph, SnaLink, SnaNode } from "../src/lib/sna";
import { analyzeNetwork } from "../src/lib/snaNetwork";

const node = (id: string, kind: SnaNode["kind"] = "hub"): SnaNode => ({ id, kind, posts: 1, mentions: 0 });
const link = (source: string, target: string, n = 1): SnaLink => ({ source, target, n, tone: "neutral", counts: { negative: 0, neutral: n, positive: 0, unknown: 0 } });

// Two tight groups (a1–a3, b1–b3) joined only through "jembatan".
const groups: SnaGraph = {
  nodes: ["a1", "a2", "a3", "b1", "b2", "b3", "jembatan"].map((id) => node(id)),
  links: [
    link("a1", "a2", 5), link("a2", "a3", 5), link("a1", "a3", 5),
    link("b1", "b2", 5), link("b2", "b3", 5), link("b1", "b3", 5),
    link("a1", "jembatan"), link("jembatan", "b1"),
  ],
};

test("betweenness: the only account linking two groups is bridge #1", () => {
  const a = analyzeNetwork(groups);
  assert.equal(a.bridges[0].id, "jembatan");
  assert.equal(a.bridges[0].rank, 1);
  assert.equal(a.accounts, 7);
  // a1 and b1 also carry the paths between the groups, the other group members none.
  assert.deepEqual(new Set(a.bridges.map((b) => b.id)), new Set(["jembatan", "a1", "b1"]));
  assert.equal(a.betweenness.get("a2"), 0);
});

test("communities: two separate groups, the bridge links both", () => {
  const a = analyzeNetwork(groups);
  assert.equal(a.community.get("a1"), a.community.get("a3"));
  assert.equal(a.community.get("b1"), a.community.get("b3"));
  assert.notEqual(a.community.get("a1"), a.community.get("b1"));
  assert.equal(a.bridges[0].communities.length, 2);
});

test("issue nodes are not ranked as bridges; stable results for the same graph", () => {
  const issue: SnaGraph = { nodes: [node("issue:x", "issue"), node("p"), node("q")], links: [link("p", "issue:x"), link("q", "issue:x")] };
  const a = analyzeNetwork(issue);
  assert.equal(a.accounts, 2);
  assert.ok(!a.bridges.some((b) => b.id === "issue:x"));
  assert.deepEqual([...analyzeNetwork(groups).community], [...analyzeNetwork(groups).community]);
});
