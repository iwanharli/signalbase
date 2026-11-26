import assert from "node:assert/strict";
import { test } from "node:test";
import { buildGraph, buildIssueGraph, dominantTone, emptyHubs, parseSnaDays, toneOf } from "../src/lib/sna";

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

test("switching emotions off drops their counts, empty links and accounts left without a link, hubs included", async () => {
  const { filterGraph, buildGraph } = await import("../src/lib/sna");
  const g = buildGraph([{ username: "a", source: "x", posts: 5 }], [
    { hub: "a", target: "b", emotion: "marah", n: 2 }, { hub: "a", target: "b", emotion: "puas", n: 3 }, { hub: "a", target: "c", emotion: "marah", n: 1 },
  ]);
  assert.equal(filterGraph(g, []), g);
  const f = filterGraph(g, ["negative"]);
  assert.deepEqual(f.links.map((l) => [l.target, l.n, l.tone]), [["b", 3, "positive"]]);
  assert.deepEqual(f.nodes.map((n) => n.id), ["a", "b"]);
  assert.deepEqual(filterGraph(g, ["negative", "positive", "neutral", "unknown"]).nodes, []);
});

test("tampilan isu: isu jadi simpul, akun teratas per isu menurut engagement, akun di dua isu menjadi satu simpul", async () => {
  const { buildIssueGraph } = await import("../src/lib/sna");
  const issues = [{ id: "i1", title: "Isu satu", posts: 50 }, { id: "i2", title: "Isu dua", posts: 20 }, { id: "i3", title: "Tanpa akun", posts: 5 }];
  const rows = [
    { issue: "i1", username: "a", source: "x", emotion: "marah", n: 3, eng: 900 },
    { issue: "i1", username: "b", source: "x", emotion: "netral", n: 1, eng: 10 },
    { issue: "i1", username: "c", source: "x", emotion: "netral", n: 5, eng: 1 },   // banyak post, engagement kecil: tidak masuk 2 teratas
    { issue: "i2", username: "a", source: "x", emotion: "mendukung", n: 2, eng: 100 },
  ];
  const g = buildIssueGraph(issues, rows, 2);
  assert.deepEqual(g.nodes.filter((n) => n.kind === "issue").map((n) => n.id), ["issue:i1", "issue:i2"]); // isu tanpa akun tidak digambar
  const a = g.nodes.find((n) => n.id === "a")!;
  assert.equal(a.kind, "hub");
  assert.equal(a.engagement, 1000); // dua isu, satu simpul
  assert.equal(g.nodes.some((n) => n.id === "c"), false);
  assert.equal(g.links.find((l) => l.source === "a" && l.target === "issue:i1")!.tone, "negative");
  assert.equal(g.links.length, 3);
});

// Flows of the issue view: who links to the issue is decided by the time of the first post.
const flowRows = [
  { issue: "a", username: "awal", source: "x", emotion: "netral", n: 2, eng: 5, first: "2026-11-26T08:00:00" },
  { issue: "a", username: "kedua", source: "x", emotion: "marah", n: 1, eng: 50, first: "2026-11-26T08:30:00" },
  { issue: "a", username: "ketiga", source: "x", emotion: "netral", n: 3, eng: 1, first: "2026-11-26T12:00:00" },
  { issue: "a", username: "akhir", source: "x", emotion: "mendukung", n: 1, eng: 9, first: "2026-11-28T09:00:00" },
];
const issueA = [{ id: "a", title: "Isu A", posts: 7 }];
const parentOf = (g: ReturnType<typeof buildIssueGraph>) => Object.fromEntries(g.links.map((l) => [l.source, l.target]));

test("alur langsung: semua akun ke isu", () => {
  assert.deepEqual(parentOf(buildIssueGraph(issueA, flowRows, 10)), { awal: "issue:a", kedua: "issue:a", ketiga: "issue:a", akhir: "issue:a" });
});

test("alur rantai: urut waktu post pertama, yang paling awal ke isu", () => {
  const g = buildIssueGraph(issueA, flowRows, 10, "rantai");
  assert.deepEqual(parentOf(g), { awal: "issue:a", kedua: "awal", ketiga: "kedua", akhir: "ketiga" });
  assert.equal(g.nodes.find((n) => n.id === "awal")?.first, "2026-11-26T08:00:00");
});

test("alur mention: anak dari akun lebih awal yang disebut, selain itu ke isu; tidak pernah mundur waktu", () => {
  const pairs = [
    { issue: "a", source: "ketiga", target: "@Awal" }, // case and @ ignored
    { issue: "a", source: "awal", target: "akhir" }, // mentions a later account: stays under the issue
    { issue: "a", source: "akhir", target: "kedua" },
  ];
  assert.deepEqual(parentOf(buildIssueGraph(issueA, flowRows, 10, "mention", pairs)), { awal: "issue:a", kedua: "issue:a", ketiga: "awal", akhir: "kedua" });
});

test("alur gelombang: gelombang pertama ke isu, berikutnya ke akun paling berpengaruh di gelombang sebelumnya", () => {
  const g = buildIssueGraph(issueA, flowRows, 10, "gelombang");
  // awal and kedua: first hour (wave 1); ketiga: 4 h later (wave 2); akhir: 2 days later (wave 4).
  assert.deepEqual(parentOf(g), { awal: "issue:a", kedua: "issue:a", ketiga: "kedua", akhir: "ketiga" });
  assert.deepEqual(g.nodes.filter((n) => n.kind === "hub").map((n) => [n.id, n.wave]), [["awal", 1], ["kedua", 1], ["ketiga", 2], ["akhir", 4]]);
});

test("alur selain langsung menjaga akun paling awal walau engagement-nya kecil", () => {
  const ids = (g: ReturnType<typeof buildIssueGraph>) => g.nodes.filter((n) => n.kind === "hub").map((n) => n.id).sort();
  assert.deepEqual(ids(buildIssueGraph(issueA, flowRows, 2)), ["akhir", "kedua"]);
  assert.deepEqual(ids(buildIssueGraph(issueA, flowRows, 2, "rantai")), ["awal", "kedua"]);
});
