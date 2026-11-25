import assert from "node:assert/strict";
import { test } from "node:test";
import { labelAiSchema } from "../src/lib/ai/labelAi";
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
  const out = publicLabelAi({ apiKeyId: "p", provider: "grok", model: "m", keyEnc: "sealed-secret", keyHint: "abcd", prompt: null, startFrom: null, updatedBy: "u", createdAt: now, updatedAt: now });
  assert.doesNotMatch(JSON.stringify(out), /sealed-secret|keyEnc/);
});
