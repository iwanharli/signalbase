import assert from "node:assert/strict";
import { test } from "node:test";
import { briefAiSchema, change, heatFromIssues, type IssueRow } from "../src/lib/brief";

const minimal = {
  suhu: { level: "waspada", momentum: "menurun", ringkas: "Suhu waspada." },
  keputusan: { pengantar: "Dua isu menuntut keputusan.", isu: [{ judul: "Isu A", tenggat: "SEGERA" }] },
  keterbatasan: "Cakupan label 43%.",
};

test("brief assessment: enums normalised, missing sections default to empty", () => {
  const a = briefAiSchema.parse(minimal);
  assert.equal(a.suhu.level, "WASPADA");
  assert.equal(a.suhu.momentum, "MENURUN");
  assert.deepEqual(a.kartu, []);
  assert.deepEqual(a.catatanKpi, {});
});

test("brief assessment: unknown values fall back, lists are capped, evidence codes cleaned", () => {
  const a = briefAiSchema.parse({
    ...minimal,
    suhu: { level: "PANAS", momentum: "??", ringkas: "x" },
    matriks: Array.from({ length: 14 }, (_, i) => ({ tindakan: `T${i}`, waktu: "SEGERA", prioritas: i ? "rendah" : "urgent" })),
    kartu: [{ kode: "E1", judul: "J", fakta: ["f"], implikasi: "i", tindakan: "t", tenggat: "SEGERA", keyakinan: "TINGGI", evidence: ["e1", "E1", "x9", "S12"] }],
  });
  assert.equal(a.suhu.level, "WASPADA");
  assert.equal(a.suhu.momentum, "STABIL");
  assert.equal(a.matriks.length, 10);
  assert.equal(a.matriks[0].prioritas, "SEDANG");
  assert.equal(a.matriks[1].prioritas, "RENDAH");
  assert.equal(a.kartu[0].keyakinan, "tinggi");
  assert.deepEqual(a.kartu[0].evidence, ["E1", "S12"]);
});

test("heat from issues and percentage change", () => {
  const issue = (level: string) => ({ level }) as IssueRow;
  assert.equal(heatFromIssues([issue("High"), issue("Critical")]), "TINGGI");
  assert.equal(heatFromIssues([issue("High")]), "WASPADA");
  assert.equal(heatFromIssues([]), "TERKENDALI");
  assert.equal(change({ now: 150, prev: 100 }), 50);
  assert.equal(change({ now: 5, prev: 0 }), null);
});
