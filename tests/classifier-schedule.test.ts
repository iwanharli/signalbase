import assert from "node:assert/strict";
import { test } from "node:test";
import { runPool, turnGroups } from "../src/lib/server/ai/schedule";

test("key dengan akun penyedia yang sama satu grup; awal giliran bergeser tiap putaran", () => {
  const rows = [{ id: "a", p: "x" }, { id: "b", p: "y" }, { id: "c", p: "x" }, { id: "d", p: "x" }];
  const ids = (turn: number) => turnGroups(rows, (r) => r.p, turn).map((g) => g.map((r) => r.id));
  assert.deepEqual(ids(0), [["a", "c", "d"], ["b"]]);
  assert.deepEqual(ids(1), [["c", "d", "a"], ["b"]]);
  assert.deepEqual(ids(3), [["a", "c", "d"], ["b"]]);
});

test("runPool menjalankan semua item, paling banyak `limit` sekaligus", async () => {
  let running = 0, peak = 0;
  const done: number[] = [];
  await runPool([1, 2, 3, 4, 5], 2, async (n) => {
    running++; peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, 5));
    done.push(n); running--;
  });
  assert.equal(peak, 2);
  assert.deepEqual(done.sort(), [1, 2, 3, 4, 5]);
  await runPool([], 3, async () => { throw new Error("tidak dipanggil"); });
});
