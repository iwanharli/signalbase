import assert from "node:assert/strict";
import { test } from "node:test";
import { isXai, providerNotAllowed } from "../src/lib/server/ai/providerPolicy";

const user = { id: "u", username: "u", role: "user" as const };
const compatible = (baseUrl: string) => ({ kind: "openai_compatible", baseUrl });

test("user accounts may reach Grok, but not look-alike or internal addresses", () => {
  assert.equal(providerNotAllowed(user, compatible("https://api.x.ai/v1/")), null);
  assert.equal(isXai(compatible("https://api.x.ai/v1/")), true);
  for (const url of ["https://api.x.ai.example.com/v1", "http://api.x.ai/v1", "http://127.0.0.1/v1"]) {
    assert.notEqual(providerNotAllowed(user, compatible(url)), null, url);
  }
});
