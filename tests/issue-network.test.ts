import { test } from "node:test";
import assert from "node:assert/strict";
import { mentionNetwork, newsOntology, onlineIssueNetwork, ontologyAsSna, relatedOntology } from "../src/lib/issueNetwork";
import type { OntIssue } from "../src/lib/ontology";

test("social issue, mention view: every posting account (no limit) and the accounts they mention", () => {
  const authors = Array.from({ length: 300 }, (_, i) => ({ username: `a${i}`, source: "twitter", emotion: "netral", n: 1, eng: i }));
  const g = mentionNetwork(authors, [{ hub: "a1", target: "polri", emotion: "marah", n: 3 }, { hub: "a2", target: "a3", emotion: null, n: 1 }]);
  assert.equal(g.nodes.filter((n) => n.kind === "hub").length, 300, "all 300 accounts, none cut");
  assert.deepEqual(g.nodes.filter((n) => n.kind === "child").map((n) => n.id), ["polri"], "a mentioned author stays a hub");
  assert.equal(g.links.find((l) => l.source === "a1" && l.target === "polri")?.tone, "negative");
});

test("online issue network: outlets on the issue, journalists on their outlet; bylines that are not people are dropped", () => {
  const g = onlineIssueNetwork({ title: "BSU" }, [
    { source: "kompas", author: "Andi", sentiment: "negative", n: 3 },
    { source: "kompas", author: "andi", sentiment: "positive", n: 1 },
    { source: "detik", author: "https://facebook.com/detik", sentiment: null, n: 2 },
    { source: "okezone", author: "Okezone", sentiment: "neutral", n: 1 },
  ], (s) => s.charAt(0).toUpperCase() + s.slice(1));
  assert.deepEqual(g.nodes.filter((n) => n.kind === "hub").map((n) => [n.name, n.posts]), [["Kompas", 4], ["Detik", 2], ["Okezone", 1]]);
  assert.deepEqual(g.nodes.filter((n) => n.kind === "child").map((n) => [n.name, n.posts]), [["Andi", 4]], "same journalist in any case, URL and outlet names left out");
  assert.equal(g.links.find((l) => l.target === "m:kompas")?.tone, "negative");
});

test("ontologies: a social issue with the issues sharing its actors or targets; a news issue with its topics and regions", () => {
  const issue = (id: string, actors: string[], targets: string[]) => ({ id, title: id, level: "High", score: 50, postCount: 5, sentAt: "", actors, targets } as unknown as OntIssue);
  const g = relatedOntology([issue("1", ["Kapolri"], ["DPR"]), issue("2", ["kapolri "], []), issue("3", ["Lain"], [])], "1");
  assert.deepEqual(g.nodes.filter((n) => n.kind === "issue").map((n) => n.id), ["i:1", "i:2"], "issue 3 shares nothing");
  const news = newsOntology({ id: "9", title: "BSU", score: 10, newsCount: 4 }, [{ name: "Ekonomi", n: 3 }], [{ name: "Jawa Barat", n: 2 }]);
  assert.deepEqual(news.nodes.map((n) => [n.kind, n.label]), [["issue", "BSU"], ["actor", "Ekonomi"], ["target", "Jawa Barat"]]);
  const sna = ontologyAsSna(news);
  assert.deepEqual(sna.nodes.map((n) => [n.kind, n.name ?? n.title]), [["issue", "BSU"], ["hub", "Ekonomi"], ["child", "Jawa Barat"]]);
  assert.equal(sna.links.length, 2);
});
