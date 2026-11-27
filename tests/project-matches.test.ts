import { test } from "node:test";
import assert from "node:assert/strict";
import { codesBetween, type MatchSet } from "../src/lib/media/matchSet";
import { buildWhere } from "../src/lib/server/bank/query";
import { parseKeyScope } from "../src/lib/media/keyScope";

const set: MatchSet = {
  coverFrom: "2026-09-01",
  codes: ["a", "b", "c", "d", "e"],
  at: ["2026-09-01T00:00:00", "2026-11-20T08:00:00", "2026-11-21T23:59:59", "2026-11-22T00:00:00", "2026-11-27T10:00:00"],
};

test("codesBetween: the stored codes of a date range, both ends inclusive", () => {
  assert.deepEqual(codesBetween(set, null, null), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(codesBetween(set, "2026-11-21", null), ["c", "d", "e"]);
  assert.deepEqual(codesBetween(set, null, "2026-11-21"), ["a", "b", "c"]);
  assert.deepEqual(codesBetween(set, "2026-11-21", "2026-11-21"), ["c"]);
  assert.deepEqual(codesBetween(set, "2026-11-22T00:00:00", null), ["d", "e"]);
  assert.deepEqual(codesBetween(set, "2026-12-01", null), []);
  assert.deepEqual(codesBetween(set, "2026-11-25", "2026-11-23"), []);
});

const keywords = Array.from({ length: 70 }, (_, i) => `kata${i} polisi`);

test("parseKeyScope keeps the other restrictions of a long keyword list", () => {
  const scope = parseKeyScope({ types: ["social"], relevance: "relevant" }, keywords);
  assert.equal(scope.keywords.length, 70);
  assert.deepEqual(scope.types, ["social"]);
  assert.equal(scope.relevance, "relevant");
});

test("buildWhere: stored matches replace the keyword search within their range", () => {
  const scope = { ...parseKeyScope({}, keywords), matched: { social: set } };
  const recent = buildWhere("social", new URLSearchParams({ from: "2026-11-21" }), scope);
  assert.ok(!recent.where.includes("to_tsquery"), "no keyword search for a range the matches cover");
  assert.ok(recent.values.some((v) => Array.isArray(v) && v.join() === "c,d,e"));

  const all = buildWhere("social", new URLSearchParams(), scope);
  assert.ok(all.where.includes("to_tsquery"), "older than coverFrom: still searched");
  assert.ok(all.values.includes("2026-09-01"));

  const since = buildWhere("social", new URLSearchParams({ since: "2026-11-22 00:00:00" }), scope);
  assert.ok(!since.where.includes("to_tsquery"));
  assert.ok(since.values.some((v) => Array.isArray(v) && v.join() === "d,e"));

  // Without stored matches (still matching, or online not covered): the search as before.
  const plain = buildWhere("online", new URLSearchParams({ from: "2026-11-21" }), scope);
  assert.ok(plain.where.includes("to_tsquery"));
});
