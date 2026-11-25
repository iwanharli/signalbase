import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_LABELS, normalizeLabels, defaultLabelPrompt } from "../src/lib/media/manualLabels";

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
  assert.match(defaultLabelPrompt(["Hoaks", "Provokasi"]), /Pilihan label:\n- Hoaks\n- Provokasi\n\nAturan:/);
  assert.match(defaultLabelPrompt(["Hoaks", "Provokasi"]), /Boleh lebih dari satu/);
  assert.doesNotMatch(defaultLabelPrompt(["Hoaks"]), /lebih dari satu/);
  assert.match(defaultLabelPrompt(["Hoaks"]), /alasan singkat dan skor keyakinan dalam persen/);
  const example = /contoh ini:\n([\s\S]*?)\n\n- Sertakan/.exec(defaultLabelPrompt(['Label "A"']))![1];
  assert.deepEqual(JSON.parse(example).results[0].labels[0], { label: 'Label "A"', confidence: 85, reason: "alasan singkat" });
});
