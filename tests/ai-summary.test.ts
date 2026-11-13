import assert from "node:assert/strict";
import { test } from "node:test";
import { aiSettingInputSchema, callCost, stripCodes, summaryContentSchema, withSources } from "../src/lib/ai/summary";

const prices = { priceInput: 0.3, priceCachedInput: 0.006, priceOutput: 1.2 };

test("call cost prices cached input separately from the rest", () => {
  assert.equal(callCost({ input: 1_000_000, cached: 0, output: 0 }, prices), 0.3);
  assert.equal(callCost({ input: 0, cached: 0, output: 1_000_000 }, prices), 1.2);
  // 400k of the 1M input came from cache: 600k × 0.3 + 400k × 0.006
  assert.ok(Math.abs(callCost({ input: 1_000_000, cached: 400_000, output: 0 }, prices) - 0.1824) < 1e-9);
});

const reply = {
  headline: "Isu A mendominasi",
  overview: "Paragraf.",
  sentiment: { tone: "Negatif", note: "Opini memburuk." },
  highlights: Array.from({ length: 7 }, (_, i) => ({ title: `Isu ${i}`, detail: "Detail.", tone: "aneh" })),
};

test("summary reply: odd tones fall back to netral, lists are capped, missing lists default to empty", () => {
  const s = summaryContentSchema.parse(reply);
  assert.equal(s.sentiment.tone, "negatif");
  assert.equal(s.highlights.length, 5);
  assert.equal(s.highlights[0].tone, "netral");
  assert.deepEqual(s.watch, []);
  assert.deepEqual(s.actions, []);
});

test("summary reply without highlights or headline is rejected", () => {
  assert.equal(summaryContentSchema.safeParse({ ...reply, highlights: [] }).success, false);
  assert.equal(summaryContentSchema.safeParse({ ...reply, headline: "" }).success, false);
});

const form = {
  provider: { kind: "openai_compatible", baseUrl: "https://api.deepseek.com", model: "deepseek-flash", apiKey: "" },
  summaryEnabled: true, summaryHour: 6, includeProjects: true, monthlyBudget: null,
  priceInput: 0.3, priceCachedInput: 0.006, priceOutput: 1.2, currency: "usd",
};

test("settings form: empty key keeps the stored one, a password-like key is refused, base URL required", () => {
  const ok = aiSettingInputSchema.parse(form);
  assert.equal(ok.currency, "USD");
  assert.equal(aiSettingInputSchema.safeParse({ ...form, provider: { ...form.provider, apiKey: "rahasia123" } }).success, false);
  assert.equal(aiSettingInputSchema.safeParse({ ...form, provider: { ...form.provider, baseUrl: "" } }).success, false);
  assert.equal(aiSettingInputSchema.safeParse({ ...form, summaryHour: 24 }).success, false);
});

const v2 = {
  ...reply,
  highlights: [{ title: "Isu", detail: "Fakta.", implication: "Penilaian.", impact: "TINGGI", sentiment: "negatif", trend: "naik", evidence: ["e1", "S9", "x1", "E1"] }],
  watch: [{ text: "Bila X melewati Y", evidence: ["I1"] }, "indikator lama"],
  actions: [{ action: "Lakukan A", reason: "Karena B" }, "aksi lama"],
  confidence: { level: "sedang", note: "Cakupan label 35%." },
};

test("v2 reply: enums normalised, evidence codes uppercased, deduplicated and malformed ones dropped, old string lists still accepted", () => {
  const s = summaryContentSchema.parse(v2);
  assert.equal(s.highlights[0].impact, "tinggi");
  assert.deepEqual(s.highlights[0].evidence, ["E1", "S9"]);
  assert.deepEqual(s.watch[1], { text: "indikator lama", evidence: [] });
  assert.deepEqual(s.actions[1], { action: "aksi lama" });
  assert.equal(s.confidence?.level, "sedang");
});

test("sources keep only codes that were in the input, with what they point to", () => {
  const refs = new Map([["E1", { label: "Isu EWS: A", url: "https://x.test/a" }], ["I1", { label: "Isu berita: B", url: null }]]);
  const s = withSources(summaryContentSchema.parse(v2), refs);
  assert.deepEqual(s.highlights[0].evidence, ["E1"]); // S9 was never in the input
  assert.deepEqual(s.watch[0].evidence, ["I1"]);
  assert.deepEqual(Object.keys(s.sources).sort(), ["E1", "I1"]);
});

test("input codes written into prose are removed, the rest of the sentence kept", () => {
  assert.equal(stripCodes("E1 Critical serta E3/E4 High aktif pada 11-12 November."), "Critical serta High aktif pada 11-12 November.");
  assert.equal(stripCodes("Klaster 472 berita dan berita B1 menyebut Propam."), "Klaster 472 berita dan berita menyebut Propam.");
  assert.equal(stripCodes("Warganet marah (S2, S5) soal ini."), "Warganet marah soal ini.");
  assert.equal(stripCodes("Tol KM 12 dan Pasal 33 tetap utuh."), "Tol KM 12 dan Pasal 33 tetap utuh.");
});
