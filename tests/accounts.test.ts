import assert from "node:assert/strict";
import { test } from "node:test";
import { newAccountSchema, signupFields } from "../src/lib/accounts";
import { z } from "zod";

const base = { name: "Budi Santoso", username: "Budi.KIPERMAS", password: "rahasia123" };

test("a client keeps its institution and last day of access; the username is lowercased", () => {
  const a = newAccountSchema.parse({ ...base, role: "user", institution: "SLOG POLRI", expiresAt: "2026-12-31" });
  assert.equal(a.username, "budi.kipermas");
  assert.equal(a.institution, "SLOG POLRI");
  assert.equal(a.expiresAt, "2026-12-31");
});

test("a client without an end date has no end; a viewer never has institution or end date", () => {
  assert.equal(newAccountSchema.parse({ ...base, role: "user" }).expiresAt, null);
  const v = newAccountSchema.parse({ ...base, role: "viewer", institution: "X", expiresAt: "2026-12-31" });
  assert.equal(v.institution, null);
  assert.equal(v.expiresAt, null);
});

test("admins cannot create admins, and weak input is refused", () => {
  assert.equal(newAccountSchema.safeParse({ ...base, role: "admin" }).success, false);
  assert.equal(newAccountSchema.safeParse({ ...base, role: "user", password: "pendek" }).success, false);
  assert.equal(newAccountSchema.safeParse({ ...base, role: "user", username: "ab" }).success, false);
  assert.equal(newAccountSchema.safeParse({ ...base, role: "user", expiresAt: "31-12-2026" }).success, false);
});

test("a sign-up must say its institution and what it wants monitored", () => {
  const schema = z.object(signupFields);
  assert.equal(schema.safeParse({ institution: "Polda Riau", topics: "karhutla, banjir, demo" }).success, true);
  assert.equal(schema.safeParse({ institution: "", topics: "karhutla" }).success, false);
  assert.equal(schema.safeParse({ institution: "Polda Riau", topics: "" }).success, false);
});
