import assert from "node:assert/strict";
import { test } from "node:test";
import { overallProgress, scopeCountsFor, sharePct, typeProgress } from "../src/lib/ai/progress";

const now = Date.parse("2026-11-26T00:00:00Z");
const startFrom = new Date("2026-10-01T00:00:00Z"); // 56 hari sebelum `now`

test("progres menurut rentang waktu: sudah mundur separuh jalan = 50%", () => {
  const p = typeProgress({ type: "social", cursor: { oldest: { ts: "2026-10-29T00:00:00.000000" } }, startFrom, now, done: 10, total: null });
  assert.equal(p.state, "backfill");
  assert.equal(p.pct, 50);
  assert.equal(p.reached, "2026-10-29T00:00:00.000000");
});

test("belum mulai 0%, selesai 100%, mundur penuh tapi belum selesai maksimal 99%", () => {
  assert.deepEqual(typeProgress({ type: "online", cursor: undefined, startFrom, now, done: 0, total: null }).state, "waiting");
  assert.equal(typeProgress({ type: "online", cursor: { backfillDone: true }, startFrom, now, done: 5, total: null }).pct, 100);
  assert.equal(typeProgress({ type: "online", cursor: { oldest: { ts: "2026-09-01T00:00:00" } }, startFrom, now, done: 5, total: null }).pct, 99);
});

test("tanpa tanggal mulai: pakai jumlah cakupan tersimpan, kalau tidak ada null", () => {
  const cursor = { oldest: { ts: "2026-11-01T00:00:00" } };
  assert.equal(typeProgress({ type: "social", cursor, startFrom: null, now, done: 250, total: 1000 }).pct, 25);
  assert.equal(typeProgress({ type: "social", cursor, startFrom: null, now, done: 250, total: null }).pct, null);
});

test("keseluruhan: rata-rata jenis media; satu selesai satu berjalan = melabel", () => {
  const social = typeProgress({ type: "social", cursor: { backfillDone: true }, startFrom, now, done: 1, total: null });
  const online = typeProgress({ type: "online", cursor: { oldest: { ts: "2026-10-29T00:00:00" } }, startFrom, now, done: 1, total: null });
  assert.deepEqual(overallProgress([social, online]), { state: "backfill", pct: 75 });
  assert.deepEqual(overallProgress([social]), { state: "live", pct: 100 });
  assert.deepEqual(overallProgress([]), { state: "waiting", pct: null });
});

test("jumlah tersimpan diutamakan: sama dengan halaman proyek (4.404 / 128.368 = 3%)", () => {
  const social = typeProgress({ type: "social", cursor: { oldest: { ts: "2026-11-23T19:11:00" } }, startFrom, now, done: 4404, total: 102062 });
  const online = typeProgress({ type: "online", cursor: undefined, startFrom, now, done: 0, total: 26306 });
  assert.equal(social.pct, 4);
  assert.deepEqual(overallProgress([social, online], [102062, 26306]), { state: "backfill", pct: 3 });
  assert.equal(overallProgress([social, online], [102062, null]).pct, 2); // satu belum terhitung: rata-rata per jenis
  assert.equal(sharePct(4404, 128368), 3);
  assert.equal(sharePct(10, 10), 100);
  assert.equal(sharePct(5, 0), 0);
});

test("jumlah tersimpan hanya dipakai untuk cakupan dan rentang yang sama", () => {
  const stored = { scope: "S", ranges: { "": { social: 10, at: 1 }, "2026-09-30T17:00:00.000Z": { social: 5, at: 1 } } };
  assert.equal(scopeCountsFor(stored, "S", "2026-09-30T17:00:00.000Z")?.social, 5);
  assert.equal(scopeCountsFor(stored, "S", "")?.social, 10);
  assert.equal(scopeCountsFor(stored, "lain", ""), null);
  assert.equal(scopeCountsFor({ social: 1, online: 2, at: 1, scope: "S" }, "S", ""), null); // bentuk lama
  assert.equal(scopeCountsFor(null, "S", ""), null);
});
