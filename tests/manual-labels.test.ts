import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_LABELS, normalizeLabels } from "../src/lib/media/manualLabels";

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
