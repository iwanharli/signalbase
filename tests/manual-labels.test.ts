import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_LABELS, normalizeLabels, defaultLabelPrompt, labelOutputFormat, syncLabelList } from "../src/lib/media/manualLabels";

test("label choices are trimmed, spaces collapsed, empties and case-insensitive duplicates dropped, order kept", () => {
  assert.deepEqual(normalizeLabels(["  Prioritas ", "tindak   lanjut", "", "PRIORITAS", "Hoaks", "hoaks "]), ["Prioritas", "tindak lanjut", "Hoaks"]);
  assert.deepEqual(normalizeLabels([]), []);
});

test("too long, too many or malformed label lists are refused", () => {
  assert.throws(() => normalizeLabels(["x".repeat(41)]), /maksimal 40/i);
  assert.throws(() => normalizeLabels(Array.from({ length: MAX_LABELS + 1 }, (_, i) => `Label ${i}`)), /Maksimal 30/);
  assert.throws(() => normalizeLabels("Prioritas"), /tidak valid/);
  assert.throws(() => normalizeLabels([1, 2]), /tidak valid/);
});

test("default AI prompt lists the project's labels, and is empty without any", () => {
  assert.equal(defaultLabelPrompt([]), "");
  const two = defaultLabelPrompt(["Hoaks", "Provokasi"]);
  assert.match(two, /Pilihan label:\n- Hoaks\n- Provokasi\n\nCara menilai:/);
  assert.match(two, /boleh punya lebih dari satu/);
  assert.doesNotMatch(defaultLabelPrompt(["Hoaks"]), /lebih dari satu/);
  assert.match(two, /Di bawah 40: jangan sertakan/);
  assert.doesNotMatch(two, /JSON/);
});

test("the fixed answer format carries a valid JSON example", () => {
  const example = /contoh ini:\n([\s\S]*?)\n\n- Sertakan/.exec(labelOutputFormat(['Label "A"']))![1];
  assert.deepEqual(JSON.parse(example).results[0].labels[0], { label: 'Label "A"', confidence: 85, reason: "alasan singkat" });
});

test("an edited prompt's label list follows the project, keeping meanings and the rest of the text", () => {
  const edited = "Aturan saya.\nPilihan label:\n- Hoaks: klaim keliru\n  contoh: kabar palsu\n- Lama\n- Hoaks Politik (khusus pemilu)\n\nPenutup:\n- tetap";
  assert.equal(syncLabelList(edited, ["Provokasi", "Hoaks", "Hoaks Politik"]),
    "Aturan saya.\nPilihan label:\n- Provokasi\n- Hoaks: klaim keliru\n  contoh: kabar palsu\n- Hoaks Politik (khusus pemilu)\n\nPenutup:\n- tetap");
  assert.equal(syncLabelList(edited, []), edited);
  assert.equal(syncLabelList("tanpa daftar\n- x", ["Hoaks"]), "tanpa daftar\n- x");
  const fresh = defaultLabelPrompt(["A", "B"]);
  assert.equal(syncLabelList(fresh, ["A", "B"]), fresh);
});
