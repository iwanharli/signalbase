import assert from "node:assert/strict";
import { test } from "node:test";
import { changePct, ratioFill } from "../src/lib/commandCenter";

test("ratioFill is half at the usual level and capped at full", () => {
  assert.equal(ratioFill(10, 10), 0.5);
  assert.equal(ratioFill(40, 10), 1);
  assert.equal(ratioFill(0, 10), 0);
  assert.equal(ratioFill(5, 0), 1);
  assert.equal(ratioFill(0, 0), 0);
});

test("changePct is a percentage and null without a base", () => {
  assert.equal(changePct(150, 100), 50);
  assert.equal(changePct(5, 0), null);
});
