import assert from "node:assert/strict";
import { test } from "node:test";
import { aiPausedFor, clientActive } from "../src/lib/server/projectAccess";

const day = 86_400_000;
const active = { status: "active", planExpiresAt: new Date(Date.now() + 30 * day) };
const noEnd = { status: "active", planExpiresAt: null };
const ended = { status: "active", planExpiresAt: new Date(Date.now() - day) };
const suspended = { status: "suspended", planExpiresAt: null };
const pending = { status: "pending", planExpiresAt: null };

test("active client: approved, not suspended, access not expired (or unlimited)", () => {
  assert.equal(clientActive(active), true);
  assert.equal(clientActive(noEnd), true);
  assert.equal(clientActive(ended), false);
  assert.equal(clientActive(suspended), false);
  assert.equal(clientActive(pending), false);
});

test("a project's AI is paused only when it has clients and none is active", () => {
  assert.equal(aiPausedFor([]), false, "proyek tanpa klien mengikuti saklar admin");
  assert.equal(aiPausedFor([ended]), true);
  assert.equal(aiPausedFor([ended, suspended]), true);
  assert.equal(aiPausedFor([ended, active]), false, "satu klien aktif cukup");
  assert.equal(aiPausedFor([noEnd]), false);
});

test("clientMayWrite: clients may only correct labels and AI categories", async () => {
  const { clientMayWrite } = await import("../src/lib/server/auth");
  assert.ok(clientMayWrite("PUT", "/api/admin/keys/abc/item-labels"));
  assert.ok(clientMayWrite("PUT", "/api/admin/keys/abc/classifications"));
  assert.ok(!clientMayWrite("POST", "/api/admin/keys/abc/item-labels"));
  assert.ok(!clientMayWrite("PUT", "/api/admin/keys/abc/labels"));
  assert.ok(!clientMayWrite("PATCH", "/api/admin/keys/abc"));
  assert.ok(!clientMayWrite("PUT", "/api/admin/keys/abc/item-labels/x"));
});
