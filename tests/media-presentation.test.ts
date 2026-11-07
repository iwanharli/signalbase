import assert from "node:assert/strict";
import { test } from "node:test";
import { analysisState, formatMetricCount, formatWibDate, uniqueTags } from "../src/lib/media/presentation";
import type { Analysis } from "../src/lib/media/types";

const emptyAnalysis: Analysis = { summary: null, target: null, score: null, signals: [], topics: [], factors: null, relevance: null };

test("missing mood does not imply missing analysis", () => {
  assert.equal(analysisState({ mood: null, analysis: null }), "pending");
  assert.equal(analysisState({ mood: null, analysis: emptyAnalysis }), "unlabelled");
  assert.equal(analysisState({ mood: "  ", analysis: emptyAnalysis }), "unlabelled");
  assert.equal(analysisState({ mood: "marah", analysis: emptyAnalysis }), "labelled");
});

test("social metrics use Indonesian abbreviations without rounding 999 into thousands", () => {
  assert.equal(formatMetricCount(0), "0");
  assert.equal(formatMetricCount(999), "999");
  assert.equal(formatMetricCount(1000), "1 rb");
  assert.equal(formatMetricCount(1200), "1,2 rb");
  assert.equal(formatMetricCount(18000), "18 rb");
  assert.equal(formatMetricCount(999999), "1 jt");
  assert.equal(formatMetricCount(1500000), "1,5 jt");
  assert.equal(formatMetricCount(1000000000), "1 M");
});

test("merged signals and topics omit duplicate display labels and blank values", () => {
  assert.deepEqual(uniqueTags(["Pelayanan_Publik", "pelayanan publik", "  POLISI ", "polisi", "", "  ", "hukum"]), ["Pelayanan Publik", "POLISI", "hukum"]);
});

test("modal dates consistently use WIB and handle unavailable values", () => {
  const value = formatWibDate("2026-11-06T19:30:00.000Z");
  assert.match(value, /7 Nov 2026/);
  assert.match(value, /02[.:]30 WIB/);
  assert.equal(formatWibDate("invalid"), "Tidak tersedia");
  assert.equal(formatWibDate(undefined), "Tidak tersedia");
});
