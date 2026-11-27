import assert from "node:assert/strict";
import { test } from "node:test";
import { escapeLike, imageSearchText, parseSearch } from "../src/lib/media/searchQuery";

test("parseSearch: plain words and OR as before", () => {
  assert.deepEqual(parseSearch("sidang etik"), [{ words: "sidang etik", phrases: [], accounts: [] }]);
  assert.deepEqual(parseSearch("polri OR polisi").map((p) => p.words), ["polri", "polisi"]);
  assert.deepEqual(parseSearch("polri | polisi").map((p) => p.words), ["polri", "polisi"]);
  assert.deepEqual(parseSearch("orang koruptor").map((p) => p.words), ["orang koruptor"]); // "or" inside a word is not a separator
});

test("parseSearch: exact phrases in quotes", () => {
  assert.deepEqual(parseSearch('"sidang etik" listyo'), [{ words: "listyo", phrases: ["sidang etik"], accounts: [] }]);
  // OR inside quotes stays part of the phrase
  assert.deepEqual(parseSearch('"hitam or putih"'), [{ words: "", phrases: ["hitam or putih"], accounts: [] }]);
  assert.deepEqual(parseSearch('"tanpa penutup'), [{ words: "", phrases: ["tanpa penutup"], accounts: [] }]);
});

test("parseSearch: accounts with @", () => {
  assert.deepEqual(parseSearch("@DivHumas_Polri narkoba"), [{ words: "narkoba", phrases: [], accounts: ["DivHumas_Polri"] }]);
  assert.deepEqual(parseSearch('@"Divisi Humas Polri"'), [{ words: "", phrases: [], accounts: ["Divisi Humas Polri"] }]);
  assert.deepEqual(parseSearch("@kompascom OR @detikcom").map((p) => p.accounts), [["kompascom"], ["detikcom"]]);
});

test("imageSearchText: parts with an account are not searched in image text", () => {
  assert.deepEqual(imageSearchText(parseSearch('narkoba OR @kompascom OR "barang bukti"')), ["narkoba", "barang bukti"]);
});

test("escapeLike: % and _ match literally", () => {
  assert.equal(escapeLike("a_b%c"), "a\\_b\\%c");
});
