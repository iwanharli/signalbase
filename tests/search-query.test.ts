import assert from "node:assert/strict";
import { test } from "node:test";
import { escapeLike, imageSearchText, parseSearch } from "../src/lib/media/searchQuery";

test("parseSearch: kata biasa dan OR seperti sebelumnya", () => {
  assert.deepEqual(parseSearch("sidang etik"), [{ words: "sidang etik", phrases: [], accounts: [] }]);
  assert.deepEqual(parseSearch("polri OR polisi").map((p) => p.words), ["polri", "polisi"]);
  assert.deepEqual(parseSearch("polri | polisi").map((p) => p.words), ["polri", "polisi"]);
  assert.deepEqual(parseSearch("orang koruptor").map((p) => p.words), ["orang koruptor"]); // "or" di dalam kata bukan pemisah
});

test("parseSearch: frasa persis dalam tanda kutip", () => {
  assert.deepEqual(parseSearch('"sidang etik" listyo'), [{ words: "listyo", phrases: ["sidang etik"], accounts: [] }]);
  // OR di dalam kutip tetap bagian frasa
  assert.deepEqual(parseSearch('"hitam or putih"'), [{ words: "", phrases: ["hitam or putih"], accounts: [] }]);
  assert.deepEqual(parseSearch('"tanpa penutup'), [{ words: "", phrases: ["tanpa penutup"], accounts: [] }]);
});

test("parseSearch: akun dengan @", () => {
  assert.deepEqual(parseSearch("@DivHumas_Polri narkoba"), [{ words: "narkoba", phrases: [], accounts: ["DivHumas_Polri"] }]);
  assert.deepEqual(parseSearch('@"Divisi Humas Polri"'), [{ words: "", phrases: [], accounts: ["Divisi Humas Polri"] }]);
  assert.deepEqual(parseSearch("@kompascom OR @detikcom").map((p) => p.accounts), [["kompascom"], ["detikcom"]]);
});

test("imageSearchText: bagian dengan akun tidak dicari di teks gambar", () => {
  assert.deepEqual(imageSearchText(parseSearch('narkoba OR @kompascom OR "barang bukti"')), ["narkoba", "barang bukti"]);
});

test("escapeLike: % dan _ dicari apa adanya", () => {
  assert.equal(escapeLike("a_b%c"), "a\\_b\\%c");
});
