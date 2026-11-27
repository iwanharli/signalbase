import assert from "node:assert/strict";
import { test } from "node:test";
import { clusterStats, issueScore, matchClusters, MIN_AUTHORS, needsTitle, type ClusterPost } from "../src/lib/issueClusters";

const days = ["2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24", "2026-11-25"];
const post = (code: string, day: string, author: string, mood: string | null = null): ClusterPost => ({ code, author, mood, ts: `${day}T10:00:00` });

test("cluster stats: per day, accounts, negative share, growth", () => {
  const posts = [post("a", "2026-11-20", "x", "netral"), post("b", "2026-11-24", "y", "marah"), post("c", "2026-11-25", "z", "menolak"), post("d", "2026-11-25", "z", null)];
  const s = clusterStats(posts, days);
  assert.equal(s.posts, 4);
  assert.equal(s.authors, 3);
  assert.equal(s.negShare, 2 / 3);
  assert.equal(s.perDay["2026-11-25"], 2);
  assert.equal(s.growth, 1.5 / 0.5); // 3 posts in the last 2 days (1.5/day) against 1 post in 5 days (min 0.5)
  assert.equal(s.firstSeen, "2026-11-20T10:00:00");
  assert.equal(s.lastSeen, "2026-11-25T10:00:00");
});

test("score: bigger, more negative and rising score higher; one-account spam scores low", () => {
  const base = { posts: 100, authors: 80, negShare: 0.2, growth: 1 };
  assert.ok(issueScore({ ...base, negShare: 0.8 }) > issueScore(base));
  assert.ok(issueScore({ ...base, growth: 3 }) > issueScore(base));
  assert.ok(issueScore({ ...base, posts: 300, authors: 240 }) > issueScore(base));
  assert.ok(issueScore({ ...base, authors: 1 }) < issueScore(base) / 10);
  assert.ok(issueScore({ posts: 5000, authors: 5000, negShare: 1, growth: 10 }) <= 100);
  assert.equal(MIN_AUTHORS, 5);
});

test("a continuing cluster keeps its ID when half its posts are shared", () => {
  const stored = [{ id: "lama-1", codes: ["a", "b", "c", "d"] }, { id: "lama-2", codes: ["x", "y"] }];
  const m = matchClusters([["a", "b", "c", "e", "f"], ["x", "q", "r", "s"], ["m", "n"]], stored);
  assert.equal(m.get(0), "lama-1");          // 3 of 4 shared
  assert.equal(m.get(1), "lama-2");          // 1 of 2 shared (half of the smaller one)
  assert.equal(m.has(2), false);             // a new issue
  // an old cluster is only taken once
  const twice = matchClusters([["a", "b", "c"], ["a", "b", "d"]], [{ id: "lama", codes: ["a", "b", "c", "d"] }]);
  assert.equal([...twice.values()].filter((v) => v === "lama").length, 1);
});

test("the AI title is written when missing or when the cluster has doubled", () => {
  assert.equal(needsTitle({ title: null, titledAt: 0, posts: 20 }), true);
  assert.equal(needsTitle({ title: "x", titledAt: 40, posts: 70 }), false);
  assert.equal(needsTitle({ title: "x", titledAt: 40, posts: 80 }), true);
});

test("EWS level from the cluster issue score", async () => {
  const { levelOf } = await import("../src/lib/server/issueClusters/ews");
  assert.equal(levelOf(80), "Critical");
  assert.equal(levelOf(55), "Critical");
  assert.equal(levelOf(54.9), "High");
  assert.equal(levelOf(5), "High");
});
