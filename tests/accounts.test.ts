import assert from "node:assert/strict";
import { test } from "node:test";
import { newAccountSchema } from "../src/lib/accounts";

const base = { name: "Budi Santoso", username: "Budi.KIPERMAS", password: "rahasia123" };
const PARENT = "6f1c2c1e-9a39-4c51-9a0e-3b1f2a7c8d90";

test("a client's main account keeps its plan and end date; the username is lowercased", () => {
  const a = newAccountSchema.parse({ ...base, role: "user", plan: "pro", expiresAt: "2026-12-31" });
  assert.equal(a.username, "budi.kipermas");
  assert.equal(a.plan, "pro");
  assert.equal(a.expiresAt, "2026-12-31");
  assert.equal(a.parentId, null);
});

test("a sub-account follows its parent: any plan sent for it is dropped", () => {
  const a = newAccountSchema.parse({ ...base, role: "user", parentId: PARENT, plan: "pro", expiresAt: "2026-12-31" });
  assert.equal(a.parentId, PARENT);
  assert.equal(a.plan, null);
  assert.equal(a.expiresAt, null);
});

test("a viewer has no plan and cannot be a client's sub-account", () => {
  assert.equal(newAccountSchema.parse({ ...base, role: "viewer", plan: "pro" }).plan, null);
  assert.equal(newAccountSchema.safeParse({ ...base, role: "viewer", parentId: PARENT }).success, false);
});

test("admins cannot create admins, and weak input is refused", () => {
  assert.equal(newAccountSchema.safeParse({ ...base, role: "admin" }).success, false);
  assert.equal(newAccountSchema.safeParse({ ...base, role: "user", password: "pendek" }).success, false);
  assert.equal(newAccountSchema.safeParse({ ...base, role: "user", username: "ab" }).success, false);
  assert.equal(newAccountSchema.safeParse({ ...base, role: "user", expiresAt: "31-12-2026" }).success, false);
});
