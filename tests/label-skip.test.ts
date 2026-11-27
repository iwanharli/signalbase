import { test } from "node:test";
import assert from "node:assert/strict";
import { meaningfulWords, skipReason, textKey } from "../src/lib/ai/labelSkip";

const item = (mood: string | null, moodLevel: number | null, relevance: "include" | "exclude" | null = null) =>
  ({ mood, moodLevel, analysis: relevance ? { relevance } : null }) as Parameters<typeof skipReason>[0];

test("meaningfulWords: links, @accounts, #tags and the X reply line carry no words", () => {
  assert.equal(meaningfulWords("Replying to @a @b @c https://t.co/x #polri"), 0);
  assert.equal(meaningfulWords("Replying to @a Sudah gila ini rezim, tolol."), 5);
});

test("skipReason: only tags or very short, marked irrelevant, or calm and low intensity; others go to the model", () => {
  assert.equal(skipReason(item("marah", 5), "@a @b @c mantap"), "pendek");
  assert.equal(skipReason(item("marah", 5, "exclude"), "Harga cabai di pasar naik lagi minggu ini menurut pedagang"), "tidak-relevan");
  assert.equal(skipReason(item("netral", 2), "Polres menggelar patroli malam di pusat kota bersama warga setempat"), "netral");
  assert.equal(skipReason(item("netral", 3), "Polres menggelar patroli malam di pusat kota bersama warga setempat"), null, "intensity 3 is read");
  assert.equal(skipReason(item("marah", 2), "Polisi korup semua, bubarkan saja institusi ini sekarang juga"), null);
  assert.equal(skipReason(item(null, null), "Teks gambar: AKSI BESAR TOLAK RUU, KUMPUL DI DPR JAM 10 PAGI"), null, "image text counts as words");
});

test("textKey: the same text whoever posts it; links, accounts, case and punctuation ignored; short text has none", () => {
  const a = textKey("@x TUJUAN PENYADAPAN agar Prabowo tumbang, yang naik wakilnya! https://t.co/abc");
  assert.ok(a);
  assert.equal(textKey("tujuan penyadapan agar prabowo tumbang yang naik wakilnya https://t.co/zzz @y"), a);
  assert.notEqual(textKey("tujuan penyadapan agar prabowo tumbang yang naik menterinya"), a);
  assert.equal(textKey("@a @b mantap sekali"), null);
});
