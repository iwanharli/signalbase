import assert from "node:assert/strict";
import { test } from "node:test";
import type { OntIssue } from "../src/lib/ontologi";
import type { Insights } from "../src/lib/media/insights";
import { changePct, issueHeat, narrative } from "../src/lib/report";

const issue = (level: string) => ({ level }) as OntIssue;

test("heat follows the highest alert level", () => {
  assert.equal(issueHeat([]).label, "TERKENDALI");
  assert.equal(issueHeat([issue("High")]).label, "WASPADA");
  assert.equal(issueHeat([issue("High"), issue("Critical")]).label, "TINGGI");
});

test("change is a rounded percentage, null without a previous period", () => {
  assert.equal(changePct(150, 100), 50);
  assert.equal(changePct(50, 100), -50);
  assert.equal(changePct(5, 0), null);
});

test("narrative reads the period and says when nothing is labelled", () => {
  const ins = { period: 7, current: { total: 150, labelled: 0, pos: 0, neg: 0 }, previous: { total: 100, labelled: 0, pos: 0, neg: 0 }, categories: [{ value: "politik", n: 40, prev: 0 }], accounts: null, media: null } as unknown as Insights;
  const text = narrative("social", ins);
  assert.match(text, /150 unggahan.*naik 50%/);
  assert.match(text, /Belum ada yang berlabel emosi/);
  assert.match(text, /politik \(40\)/);
  assert.match(narrative("online", { ...ins, current: { total: 0, labelled: 0, pos: 0, neg: 0 } }), /Tidak ada berita/);
});
