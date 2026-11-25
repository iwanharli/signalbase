import assert from "node:assert/strict";
import { test } from "node:test";
import { briefAiSchema } from "../src/lib/brief";
import { clip, schemaIssues, wellFormed } from "../src/lib/ai/clip";

test("clip tidak memotong emoji di tengah; wellFormed membersihkan setengah karakter", () => {
  assert.equal(clip("ab😀", 3), "ab"); // 😀 = 2 unit UTF-16; memotong di tengahnya membuang separuhnya
  assert.equal(clip("ab😀", 4), "ab😀");
  assert.equal(clip("abc", 10), "abc");
  const broken = "x\uD83D";
  assert.equal(wellFormed({ a: [broken, "ok 😀"], n: 1 }).a[0], "x�");
  assert.equal(wellFormed({ a: [broken, "ok 😀"], n: 1 }).a[1], "ok 😀");
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(wellFormed(broken))));
});

test("butir daftar yang tidak lengkap dibuang, narasi lain tetap terpakai", () => {
  const reply = {
    suhu: { level: "waspada", momentum: "naik", ringkas: "Percakapan meningkat." },
    keputusan: { pengantar: "Perlu keputusan.", isu: [{ judul: "Isu A", tenggat: "" }, { judul: "Isu B", tenggat: "Hari ini" }] },
    temuan: [{ judul: "T", isi: "", evidence: [] }, { judul: "T2", isi: "Isi", evidence: ["s1"] }],
    tren: { judul: "", isi: "Naik" }, // tidak lengkap: dihilangkan saja
    keterbatasan: "",
  };
  const r = briefAiSchema.safeParse(reply);
  if (!r.success) assert.fail(schemaIssues(r.error.issues));
  assert.deepEqual(r.data.keputusan.isu.map((i) => i.judul), ["Isu B"]);
  assert.deepEqual(r.data.temuan.map((x) => x.judul), ["T2"]);
  assert.equal(r.data.tren, undefined);
  assert.equal(r.data.keterbatasan, "");
  assert.equal(briefAiSchema.safeParse({ keputusan: { pengantar: "x" } }).success, false); // tanpa suhu tetap ditolak
});
