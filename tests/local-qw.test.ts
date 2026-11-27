import assert from "node:assert/strict";
import { test } from "node:test";
import { localQw, localQwMin, usesLocalQw } from "../src/lib/server/ai/localQw";

test("the local QW model is only for keys in LOCAL_QW_KEYS and when LOCAL_QW_URL is set", () => {
  process.env.LOCAL_QW_KEYS = "kunci-a, kunci-b";
  delete process.env.LOCAL_QW_URL;
  assert.equal(usesLocalQw("kunci-a"), false);
  process.env.LOCAL_QW_URL = "http://127.0.0.1:1";
  assert.equal(usesLocalQw("kunci-a"), true);
  assert.equal(usesLocalQw("kunci-b"), true);
  assert.equal(usesLocalQw("kunci-c"), false);
  delete process.env.LOCAL_QW_MIN;
  assert.equal(localQwMin(), 0.8);
  process.env.LOCAL_QW_MIN = "0.7";
  assert.equal(localQwMin(), 0.7);
  process.env.LOCAL_QW_MIN = "0"; // all local, not back to 0.8
  assert.equal(localQwMin(), 0);
  process.env.LOCAL_QW_MIN = "abc";
  assert.equal(localQwMin(), 0.8);
});

test("a per-key threshold in LOCAL_QW_KEYS overrides LOCAL_QW_MIN for that key only", () => {
  process.env.LOCAL_QW_URL = "http://127.0.0.1:1";
  process.env.LOCAL_QW_KEYS = "kunci-a, kunci-b:0.85, kunci-c:abc";
  process.env.LOCAL_QW_MIN = "0";
  assert.equal(usesLocalQw("kunci-b"), true);
  assert.equal(localQwMin("kunci-a"), 0);
  assert.equal(localQwMin("kunci-b"), 0.85);
  assert.equal(localQwMin("kunci-c"), 0); // invalid threshold = LOCAL_QW_MIN
  assert.equal(localQwMin("kunci-x"), 0);
});

test("local model service down: null (every item goes to the AI provider), not an error", async () => {
  process.env.LOCAL_QW_URL = "http://127.0.0.1:1";
  assert.equal(await localQw("social", [{ id: "x", text: "patroli malam" }]), null);
  assert.deepEqual(await localQw("social", []), { model: "", items: [] });
});
