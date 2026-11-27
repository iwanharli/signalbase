import assert from "node:assert/strict";
import { test } from "node:test";
import { keywordProblem, keywordToQuery } from "../src/lib/media/keywordExpr";
import { keyScopeSchema, labelImpact } from "../src/lib/media/keyScope";
import { keywordQuery } from "../src/lib/server/bank/query";

const q = (k: string) => { const r = keywordToQuery(k); assert.ok("query" in r, `error: ${"error" in r ? r.error : ""}`); return r.query; };

test("plain keywords work as before: words, phrases, \"polisi\" is not \"polisi tidur\"", () => {
  assert.equal(q("polri"), "(polri)");
  assert.equal(q("andi amran"), "(andi <-> amran)");
  assert.equal(q("polisi"), "(polisi & !(polisi <-> tidur))");
  assert.equal(keywordQuery(["polri", "andi amran"]), "(polri) | (andi <-> amran)");
});

test("AND / OR expressions, parentheses, quoted phrases (SLOG POLRI example)", () => {
  assert.equal(q('("Polres Kuat Polsek Tangguh" OR "Quick Win 07") AND (pelayanan OR pengaduan)'),
    "(((polres <-> kuat <-> polsek <-> tangguh) | (quick <-> win <-> 07)) & ((pelayanan) | (pengaduan)))");
  assert.equal(q('(Polres OR Polsek) AND ("urus SKCK" OR "waktu tunggu" OR "bikin laporan polisi")'),
    "(((polres) | (polsek)) & ((urus <-> skck) | (waktu <-> tunggu) | (bikin <-> laporan <-> polisi)))");
  assert.equal(q("polres or polsek and spkt"), "((polres) | (polsek) & (spkt))"); // AND mengikat lebih kuat
  assert.equal(q("(status laporan) and polres"), "(((status <-> laporan)) & (polres))"); // unquoted words = a phrase
});

test("invalid expressions are refused with a clear message", () => {
  assert.match(keywordProblem('(polres OR polsek') ?? "", /kurung belum ditutup/);
  assert.match(keywordProblem('polres OR polsek)') ?? "", /tanpa pasangan/);
  assert.match(keywordProblem('"urus skck AND polres') ?? "", /kutip belum ditutup/);
  assert.match(keywordProblem("polres AND") ?? "", /berakhir terlalu cepat/);
  assert.match(keywordProblem("AND polres") ?? "", /di antara/);
  assert.match(keywordProblem('"" OR polres') ?? "", /tidak berisi kata/);
  assert.equal(keywordProblem("polres OR polsek"), null);
  assert.equal(keyScopeSchema.safeParse({ keywords: ["(polres OR polsek"] }).success, false);
  assert.equal(keyScopeSchema.safeParse({ keywords: ['("Polres Kuat Polsek Tangguh" OR "Quick Win 07") AND (pelayanan OR pengaduan)'] }).success, true);
});

test("adding keywords does not restart categorisation; removing does", () => {
  const base = keyScopeSchema.parse({ keywords: ["polri", "polisi"] });
  assert.equal(labelImpact({ ...base, keywords: ["polri", "polisi", "(polres or polsek) and skck"] }, base), "extend");
  assert.equal(labelImpact({ ...base, keywords: ["polri"] }, base), "restart");
  assert.equal(labelImpact({ ...base, keywords: ["polri", "kpk"] }, base), "restart"); // ganti = hapus + tambah
  assert.equal(labelImpact({ ...base, keywords: ["polri", "polisi", "kpk"], types: ["social"] }, base), "restart");
  assert.equal(labelImpact(base, { ...base, keywords: [] }), "restart"); // kata kunci pertama mempersempit
  assert.equal(labelImpact({ ...base, analyzedOnly: true }, base), "keep");
  assert.equal(labelImpact(base, base), "none");
});
