import assert from "node:assert/strict";
import { test } from "node:test";
import { overallProgress, typeProgress } from "../src/lib/ai/progress";

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
