import assert from "node:assert/strict";
import { test } from "node:test";
import { aiPausedFor, clientActive } from "../src/lib/server/projectAccess";

const day = 86_400_000;
const active = { status: "active", planExpiresAt: new Date(Date.now() + 30 * day) };
const noEnd = { status: "active", planExpiresAt: null };
const ended = { status: "active", planExpiresAt: new Date(Date.now() - day) };
const suspended = { status: "suspended", planExpiresAt: null };
const pending = { status: "pending", planExpiresAt: null };

test("klien aktif: disetujui, tidak dinonaktifkan, masa akses belum berakhir (atau tanpa batas)", () => {
  assert.equal(clientActive(active), true);
  assert.equal(clientActive(noEnd), true);
  assert.equal(clientActive(ended), false);
  assert.equal(clientActive(suspended), false);
  assert.equal(clientActive(pending), false);
});

test("AI proyek dijeda hanya bila proyek punya klien dan tidak ada satu pun yang aktif", () => {
  assert.equal(aiPausedFor([]), false, "proyek tanpa klien mengikuti saklar admin");
  assert.equal(aiPausedFor([ended]), true);
  assert.equal(aiPausedFor([ended, suspended]), true);
  assert.equal(aiPausedFor([ended, active]), false, "satu klien aktif cukup");
  assert.equal(aiPausedFor([noEnd]), false);
});
