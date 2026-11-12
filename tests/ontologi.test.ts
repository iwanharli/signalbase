import assert from "node:assert/strict";
import { test } from "node:test";
import { buildOntologi, formatWindow, filterLevels, matchesKeywords, parseOntDays, type OntIssue } from "../src/lib/ontologi";

const issue = (id: string, level: string, actors: string[], targets: string[]): OntIssue => ({
  id, title: `Isu ${id}`, level, score: 70, postCount: 5, sentAt: "2026-11-10T00:00:00.000Z", actors, targets,
  summary: null, reaction: null, risk: null, location: null, category: null, emotion: null, signals: [], contentType: null, window: null, posts: [],
});

test("only the offered periods are accepted, and 7 days is the default", () => {
  assert.equal(parseOntDays(null), 7);
  for (const d of [1, 3, 7, 14, 30]) assert.equal(parseOntDays(String(d)), d);
  for (const bad of ["", "0", "5", "31", "7; DROP TABLE x"]) assert.equal(parseOntDays(bad), null);
});

test("keywords match actors or targets, ignoring case; no keywords keeps everything", () => {
  const i = issue("1", "High", ["Polisi", "Kapolri"], ["Mahasiswa"]);
  assert.ok(matchesKeywords(i, []));
  assert.ok(matchesKeywords(i, ["kapolri"]));
  assert.ok(matchesKeywords(i, ["MAHASISWA", "x"]));
  assert.ok(!matchesKeywords(i, ["tni"]));
});

test("the graph has an issue node per issue and shared entities connect issues; actor links point at the issue, target links away from it", () => {
  const g = buildOntologi([issue("1", "High", ["Polisi"], ["Mahasiswa"]), issue("2", "Critical", ["polisi  "], ["TNI"])]);
  assert.equal(g.nodes.filter((n) => n.kind === "issue").length, 2);
  const polisi = g.nodes.find((n) => n.id === "e:polisi")!;
  assert.equal(polisi.count, 2);
  assert.equal(polisi.kind, "actor");
  assert.deepEqual(g.links.filter((l) => l.role === "actor").map((l) => [l.source, l.target]), [["e:polisi", "i:1"], ["e:polisi", "i:2"]]);
  assert.deepEqual(g.links.filter((l) => l.role === "target").map((l) => [l.source, l.target]), [["i:1", "e:mahasiswa"], ["i:2", "e:tni"]]);
});

test("switching a level off drops its issues and the entities only they named", () => {
  const issues = [issue("1", "High", ["A"], ["B"]), issue("2", "Critical", ["C"], ["B"])];
  const g = buildOntologi(filterLevels(issues, ["High"]));
  assert.deepEqual(g.nodes.map((n) => n.id).sort(), ["e:b", "e:c", "i:2"]);
});

test("the alert time window is shown as readable Jakarta times, and kept as is when it cannot be read", () => {
  assert.match(formatWindow("2026-10-12T12:00:00+07:00 - 2026-10-13T18:00:00+07:00")!, /^12 Okt 2026.*12[.:]00 – 13 Okt 2026.*18[.:]00 WIB$/);
  assert.equal(formatWindow("kemarin"), "kemarin");
  assert.equal(formatWindow(null), null);
});
