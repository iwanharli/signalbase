import assert from "node:assert/strict";
import { test } from "node:test";
import { labelAiSchema } from "../src/lib/ai/labelAi";
import { backoffMs, labelErrorKind, needsReview, parseLabelReply, parseVerdict, reachesFurther, readSearchReply } from "../src/lib/ai/labelReply";
import { labelAiConfig, publicLabelAi, storedKeyFor } from "../src/lib/server/ai/labelAi";

const input = { provider: "deepseek", model: "deepseek-flash", apiKey: "", prompt: null, startFrom: null };

test("label AI settings accept only the offered providers and plausible keys", () => {
  assert.equal(labelAiSchema.safeParse(input).success, true);
  assert.equal(labelAiSchema.safeParse({ ...input, provider: "custom" }).success, false);
  assert.equal(labelAiSchema.safeParse({ ...input, apiKey: "password123" }).success, false);
  assert.equal(labelAiSchema.safeParse({ ...input, startFrom: "kemarin" }).success, false);
});

test("a stored key is only used with the provider it was entered for", () => {
  assert.equal(storedKeyFor({ provider: "grok", keyEnc: "sealed" }, "grok"), "sealed");
  assert.throws(() => storedKeyFor({ provider: "grok", keyEnc: "sealed" }, "deepseek"));
  assert.throws(() => storedKeyFor(null, "deepseek"));
  assert.equal(labelAiConfig("grok", "m", "sealed").baseUrl, "https://api.x.ai/v1");
});

test("the panel never receives the stored key", () => {
  const now = new Date();
  const out = publicLabelAi({ apiKeyId: "p", provider: "grok", model: "m", keyEnc: "sealed-secret", keyHint: "abcd", prompt: null, startFrom: null, updatedBy: "u", createdAt: now, updatedAt: now, savedAt: now, enabled: false, dailyLimit: 500,
    cursors: {}, processed: 0, failed: 0, todayCount: 0, todayDate: "", errorStreak: 0, retryAfter: null, lastError: null, lastRunAt: null });
  assert.doesNotMatch(JSON.stringify(out), /sealed-secret|keyEnc/);
});

test("AI label replies are checked item by item", () => {
  const label = (name: string, confidence: number) => ({ label: name, confidence, reason: "x" });
  const out = parseLabelReply({ results: [
    { id: "a", labels: [label("hoaks", 85), label("Hoaks", 90), label("Provokasi", 39)] },
    { id: "b", labels: [] },
    { id: "c", labels: [label("Karangan", 99)] },
    { id: "d", labels: [label("Hoaks", 0.85)] },
    { id: "e", labels: [label("Hoaks", 150)] },
    { id: "f", labels: [{ label: "Hoaks", confidence: 80 }] },
    { id: "asing", labels: [] },
    "rusak",
  ] }, ["a", "b", "c", "d", "e", "f", "g"], ["Hoaks", "Provokasi"]);
  assert.deepEqual([...out.keys()], ["a", "b"]);
  assert.deepEqual(out.get("a"), [{ label: "Hoaks", score: 85, reason: "x" }]);
  assert.deepEqual(out.get("b"), []);
  assert.throws(() => parseLabelReply({ items: [] }, ["a"], ["Hoaks"]));
});

test("label worker errors: pause, wait or split", () => {
  assert.equal(labelErrorKind("Penyedia AI menolak (400): Incorrect API key provided."), "pause");
  assert.equal(labelErrorKind("Penyedia AI menolak (402): Insufficient Balance"), "pause");
  assert.equal(labelErrorKind("Penyedia AI menolak (429): slow down"), "wait");
  assert.equal(labelErrorKind("The operation was aborted due to timeout"), "wait");
  assert.equal(labelErrorKind("Penyedia AI menolak (400): Content Exists Risk"), "batch");
  assert.equal(labelErrorKind("Jawaban model bukan JSON yang valid"), "batch");
  assert.deepEqual([backoffMs(1), backoffMs(3), backoffMs(99)], [60_000, 300_000, 1_800_000]);
  assert.equal(reachesFurther("2026-11-20", "2026-11-01"), true);
  assert.equal(reachesFurther("2026-11-20", null), true);
  assert.equal(reachesFurther("2026-11-01", "2026-11-20"), false);
  assert.equal(reachesFurther(null, "2026-11-01"), false);
});

test("labels are only checked by a search that ran, and keep only URLs the search returned", () => {
  const reply = readSearchReply([
    { type: "text", text: "mencari" },
    { type: "server_tool_use", input: { query: "q" } },
    { type: "web_search_tool_result", content: [{ url: "https://a.id/1", title: "A" }, { url: "javascript:alert(1)", title: "x" }, { url: "https://b.id/2", title: "" }] },
    { type: "web_search_tool_result", content: { type: "web_search_tool_result_error", error_code: "max_uses_exceeded" } },
    { type: "text", text: "{}" },
  ]);
  assert.deepEqual([reply.queries, [...reply.results.keys()], reply.text], [["q"], ["https://a.id/1", "https://b.id/2"], "{}"]);
  assert.throws(() => readSearchReply([{ type: "text", text: "{}" }]), /tidak melakukan pencarian/);
  assert.throws(() => readSearchReply([{ type: "web_search_tool_result", content: { error_code: "too_many_requests" } }]), (e: Error) => labelErrorKind(e.message) === "wait");

  const candidates = ["Hoaks", "Provokasi", "SARA"].map((label) => ({ label, score: 80, reason: "x" }));
  const verdict = (label: string, confidence: number, disputed: boolean, sources: string[]) => ({ label, confidence, disputed, sources, reason: "r" });
  const out = parseVerdict("Hasil: " + JSON.stringify({ labels: [
    verdict("hoaks", 90, false, ["https://a.id/1", "https://karangan.id", "https://a.id/1"]),
    verdict("Provokasi", 20, true, []),
    verdict("SARA", 10, false, []),
    verdict("Label lain", 99, false, []),
  ] }), candidates, reply.results);
  assert.deepEqual(out.map((l) => [l.label, l.score, l.sources.map((s) => s.url), needsReview(l)]), [["Hoaks", 90, ["https://a.id/1"], false], ["Provokasi", 20, [], true]]);
  assert.throws(() => parseVerdict(JSON.stringify({ labels: [verdict("Hoaks", 90, false, [])] }), candidates, reply.results), /semua label/);
  assert.throws(() => parseVerdict("tidak ada", candidates, reply.results), /JSON/);
});
