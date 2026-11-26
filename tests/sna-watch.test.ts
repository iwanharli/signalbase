import assert from "node:assert/strict";
import { test } from "node:test";
import { OPEN_SCOPE } from "../src/lib/media/keyScope";
import { buildWhere, scopeKey } from "../src/lib/server/bank/query";
import { watchInputSchema } from "../src/lib/server/snaWatch";

test("pantauan dalam proyek: post harus cocok kata kunci proyek DAN salah satu kata kunci pantauan", () => {
  const project = { ...OPEN_SCOPE, keywords: ["polri"] };
  const watch = { ...project, alsoKeywords: ["listyo", "makar", "sadap"] };
  const plain = buildWhere("social", new URLSearchParams(), project);
  const watched = buildWhere("social", new URLSearchParams(), watch);
  assert.equal((watched.where.match(/to_tsquery/g) ?? []).length, (plain.where.match(/to_tsquery/g) ?? []).length + 1);
  assert.ok(watched.values.some((v) => typeof v === "string" && v.includes("listyo") && v.includes("makar") && v.includes("|")));
  assert.notEqual(scopeKey(project), scopeKey(watch), "cache proyek dan pantauan terpisah");
});

test("validasi pantauan: kata kunci dirapikan, ganda dibuang, ekspresi rusak ditolak", () => {
  const ok = watchInputSchema.parse({ name: "Isu Listyo makar", keywords: [" Listyo", "makar", "makar", "listyo AND sadap"] });
  assert.equal(ok.key, null);
  assert.deepEqual(ok.keywords, ["listyo", "makar", "listyo and sadap"]);
  assert.equal(watchInputSchema.safeParse({ name: "X", keywords: ["makar"] }).success, false);
  assert.equal(watchInputSchema.safeParse({ name: "Isu", keywords: [] }).success, false);
  assert.equal(watchInputSchema.safeParse({ name: "Isu", keywords: ["makar AND"] }).success, false);
});
