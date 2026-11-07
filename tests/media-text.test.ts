import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { decodeTextEntities } from "../src/lib/media/text";

test("escaped post punctuation becomes readable text while links remain unchanged", () => {
  assert.equal(decodeTextEntities("Ferdinand &amp; Azwan &amp; Jokowi https://t.co/SnxMTYkEuk"), "Ferdinand & Azwan & Jokowi https://t.co/SnxMTYkEuk");
  assert.equal(decodeTextEntities("&quot;Polisi&quot; &#38; warga &#x1F44D;"), '"Polisi" & warga 👍');
  assert.equal(decodeTextEntities(null), null);
});

test("unknown entities and invalid code points are preserved without errors", () => {
  assert.equal(decodeTextEntities("&unknown; &#0; &#xD800; &#99999999;"), "&unknown; &#0; &#xD800; &#99999999;");
  assert.equal(decodeTextEntities("A & B"), "A & B");
  assert.equal(decodeTextEntities("&amp;lt;"), "&lt;");
});

test("decoded markup stays plain text when rendered by React", () => {
  const text = decodeTextEntities("&lt;script&gt;alert(1)&lt;/script&gt;");
  assert.equal(renderToStaticMarkup(createElement("p", null, text)), "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
});

test("mentions are highlighted without treating emails and URL paths as mentions", async () => {
  const { splitMentionText } = await import("../src/lib/media/text");
  const value = "Halo @polri, @nama.akun dan @akun_2! admin@example.com https://threads.net/@contoh";
  const parts = splitMentionText(value);
  assert.deepEqual(parts.filter((part) => part.mention).map((part) => part.text), ["@polri", "@nama.akun", "@akun_2"]);
  assert.equal(parts.map((part) => part.text).join(""), value);
  assert.equal(splitMentionText("@ bukan mention").some((part) => part.mention), false);
});

test("post URLs become safe links while preserving mentions, emails and the original text", async () => {
  const { splitPostText } = await import("../src/lib/media/text");
  const text = "@polri baca https://t.co/SnxMTYkEuk, www.example.com/info. admin@example.com";
  const parts = splitPostText(text);
  assert.deepEqual(parts.filter((part) => part.href).map((part) => [part.text, part.href]), [
    ["https://t.co/SnxMTYkEuk", "https://t.co/SnxMTYkEuk"],
    ["www.example.com/info", "https://www.example.com/info"],
  ]);
  assert.equal(parts.map((part) => part.text).join(""), text);
  assert.deepEqual(parts.filter((part) => part.mention).map((part) => part.text), ["@polri"]);
});

test("links preserve balanced parentheses, escape surrounding punctuation and reject unsafe destinations", async () => {
  const { splitPostText } = await import("../src/lib/media/text");
  const text = "(https://example.com/wiki/Topic_(test)). https://example.com/?a=1&b=2! javascript:alert(1) https://user:secret@example.com";
  const parts = splitPostText(text);
  assert.deepEqual(parts.filter((part) => part.href).map((part) => part.text), ["https://example.com/wiki/Topic_(test)", "https://example.com/?a=1&b=2"]);
  assert.equal(parts.map((part) => part.text).join(""), text);
});
