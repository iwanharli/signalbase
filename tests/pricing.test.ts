import { test } from "node:test";
import assert from "node:assert/strict";
import { monthProjection, priceFor, tokenCost } from "../src/lib/ai/pricing";

test("priceFor: known DeepSeek models use the official price, others the configured price", () => {
  const fallback = { input: 9, cached: 9, output: 9 };
  assert.equal(priceFor("deepseek-chat", fallback).output, 0.72);
  assert.equal(priceFor("deepseek-v4-pro", fallback).output, 2.38);
  assert.equal(priceFor("claude-haiku", fallback), fallback);
});

test("tokenCost: cached tokens are charged at the cache price", () => {
  const p = { input: 1, cached: 0.1, output: 2 };
  assert.equal(tokenCost({ input: 1_000_000, cached: 500_000, output: 1_000_000 }, p), 0.5 + 0.05 + 2);
});

test("monthProjection: average of full days before today × days in the month", () => {
  const r = monthProjection({ "2026-11-14": 1, "2026-11-15": 3, "2026-11-16": 100 }, "2026-11-16");
  assert.equal(r.basisDays, 2);
  assert.equal(r.avgDaily, 2);
  assert.equal(r.projection, 60);
  assert.equal(monthProjection({}, "2026-11-16").projection, null);
});
