import assert from "node:assert/strict";
import { test } from "node:test";
import { localQw, localQwMin, usesLocalQw } from "../src/lib/server/ai/localQw";

test("model lokal QW hanya untuk key di LOCAL_QW_KEYS dan bila LOCAL_QW_URL diisi", () => {
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
  process.env.LOCAL_QW_MIN = "0"; // semua lokal, bukan kembali ke 0,8
  assert.equal(localQwMin(), 0);
  process.env.LOCAL_QW_MIN = "abc";
  assert.equal(localQwMin(), 0.8);
});

test("ambang per key di LOCAL_QW_KEYS menimpa LOCAL_QW_MIN hanya untuk key itu", () => {
  process.env.LOCAL_QW_URL = "http://127.0.0.1:1";
  process.env.LOCAL_QW_KEYS = "kunci-a, kunci-b:0.85, kunci-c:abc";
  process.env.LOCAL_QW_MIN = "0";
  assert.equal(usesLocalQw("kunci-b"), true);
  assert.equal(localQwMin("kunci-a"), 0);
  assert.equal(localQwMin("kunci-b"), 0.85);
  assert.equal(localQwMin("kunci-c"), 0); // ambang tidak valid = LOCAL_QW_MIN
  assert.equal(localQwMin("kunci-x"), 0);
});

test("layanan model lokal mati: null (semua item ke penyedia AI), bukan error", async () => {
  process.env.LOCAL_QW_URL = "http://127.0.0.1:1";
  assert.equal(await localQw("social", [{ id: "x", text: "patroli malam" }]), null);
  assert.deepEqual(await localQw("social", []), { model: "", items: [] });
});
