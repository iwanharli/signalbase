import assert from "node:assert/strict";
import { test } from "node:test";
import type { OntIssue } from "../src/lib/ontologi";
import type { Insights } from "../src/lib/media/insights";
import { changePct, daysBetween, latestPeriod, periodLabel, weekOfYear, closingNarrative, reportFileName, entityRanking, issueHeat, locationRanking, narrative, reportTitle } from "../src/lib/report";

const issue = (level: string) => ({ level }) as OntIssue;

test("heat follows the highest alert level", () => {
  assert.equal(issueHeat([]).label, "TERKENDALI");
  assert.equal(issueHeat([issue("High")]).label, "WASPADA");
  assert.equal(issueHeat([issue("High"), issue("Critical")]).label, "TINGGI");
});

test("change is a rounded percentage, null without a previous period", () => {
  assert.equal(changePct(150, 100), 50);
  assert.equal(changePct(50, 100), -50);
  assert.equal(changePct(5, 0), null);
});

test("narrative reads the period and says when nothing is labelled", () => {
  const ins = { period: 7, current: { total: 150, labelled: 0, pos: 0, neg: 0 }, previous: { total: 100, labelled: 0, pos: 0, neg: 0 }, categories: [{ value: "politik", n: 40, prev: 0 }], accounts: null, media: null } as unknown as Insights;
  const text = narrative("social", ins);
  assert.match(text, /150 unggahan.*naik 50%/);
  assert.match(text, /Belum ada yang berlabel emosi/);
  assert.match(text, /politik \(40\)/);
  assert.match(narrative("online", { ...ins, current: { total: 0, labelled: 0, pos: 0, neg: 0 } }), /Tidak ada berita/);
});

test("the cover names the whole bank, all projects, or the one project", () => {
  const sections = [{ project: { name: "Kipermas", keywords: [] } }] as never;
  assert.equal(reportTitle({ mode: "bank", sections: [] }), "SELURUH DATA");
  assert.equal(reportTitle({ mode: "multi", sections: [] }), "SEMUA PROYEK");
  assert.equal(reportTitle({ mode: "project", sections }), "KIPERMAS");
});

test("entities and places are counted once per issue, case-insensitively, most frequent first", () => {
  const issues = [
    { actors: ["Polri", "polri", "DPR"], targets: ["Warga"], location: "Padang" },
    { actors: ["POLRI"], targets: ["Warga", "Warga"], location: "padang" },
    { actors: ["DPR"], targets: [], location: null },
  ] as unknown as OntIssue[];
  assert.deepEqual(entityRanking(issues, "actors"), [{ name: "DPR", n: 2 }, { name: "Polri", n: 2 }]);
  assert.deepEqual(entityRanking(issues, "targets"), [{ name: "Warga", n: 2 }]);
  assert.deepEqual(locationRanking(issues), [{ name: "Padang", n: 2 }]);
});

test("closing narrative names the scope, volume and top issue", () => {
  const ins = { current: { total: 1200 } };
  const sections = [{ project: { name: "Kipermas", keywords: [] }, social: { insights: ins }, online: null, issues: [{ level: "Critical", score: 90, title: "Isu A" }, { level: "High", score: 70, title: "Isu B" }] }] as never;
  const text = closingNarrative({ days: 3, mode: "project", sections });
  assert.match(text, /1\.200 unggahan.*proyek Kipermas.*3 hari/);
  assert.match(text, /tingkat tinggi.*1 isu Critical dan 1 isu High/);
  assert.match(text, /“Isu A”/);
  assert.match(closingNarrative({ days: 1, mode: "bank", sections: [{ project: null, social: null, online: null, issues: [] }] as never }), /terkendali/);
});

test("the file name carries scope, period and a timestamp, without path characters", () => {
  const at = "2026-11-13T15:30:45";
  assert.equal(reportFileName({ days: 7, mode: "bank", sections: [], at }), "Laporan Eksekutif - Semua Data - 7 hari - 20261113-153045");
  assert.equal(reportFileName({ days: 1, mode: "project", sections: [{ project: { name: "Polda/Riau: 1", keywords: [] } }] as never, at }), "Laporan Eksekutif - PoldaRiau 1 - 1 hari - 20261113-153045");
});


test("latest finished period of each kind, seen from the day after yesterday", () => {
  // Yesterday = Thursday 12 Nov 2026.
  assert.deepEqual(latestPeriod("harian", "2026-11-12"), { start: "2026-11-12", end: "2026-11-12" });
  assert.deepEqual(latestPeriod("mingguan", "2026-11-12"), { start: "2026-11-02", end: "2026-11-08" });
  assert.deepEqual(latestPeriod("bulanan", "2026-11-12"), { start: "2026-10-01", end: "2026-10-31" });
  // Yesterday = Sunday 15 Nov: that week just closed. Yesterday = 30 Nov: November just closed.
  assert.deepEqual(latestPeriod("mingguan", "2026-11-15"), { start: "2026-11-09", end: "2026-11-15" });
  assert.deepEqual(latestPeriod("bulanan", "2026-11-30"), { start: "2026-11-01", end: "2026-11-30" });
  assert.deepEqual(latestPeriod("bulanan", "2027-01-01"), { start: "2026-12-01", end: "2026-12-31" });
  assert.equal(daysBetween("2026-10-01", "2026-10-31"), 31);
});

test("period labels of archive and custom reports", () => {
  assert.equal(periodLabel({ days: 1, start: "2026-11-12", day: "2026-11-12" }), "12 November 2026");
  assert.equal(periodLabel({ days: 7, start: "2026-11-02", day: "2026-11-08" }), "2–8 November 2026");
  assert.equal(periodLabel({ days: 7, start: "2026-10-26", day: "2026-11-01" }), "26 Oktober – 1 November 2026");
  assert.equal(periodLabel({ days: 3 }), "3 hari terakhir");
});

test("ISO week numbers of archive covers", () => {
  assert.equal(weekOfYear("2026-11-02"), 45);
  assert.equal(weekOfYear("2025-12-29"), 1); // the week of 1 Jan 2026 (a Thursday) is week 1 of 2026
  assert.equal(weekOfYear("2026-12-28"), 53); // 2026 has 53 ISO weeks
});
