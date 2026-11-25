import assert from "node:assert/strict";
import { test } from "node:test";
import { buildWhere } from "../src/lib/server/bank/query";
import { OPEN_SCOPE } from "../src/lib/media/keyScope";

test("project keywords are ORed, phrases stay phrases and 'polisi' excludes 'polisi tidur'", () => {
  const { where, values } = buildWhere("online", new URLSearchParams(), { ...OPEN_SCOPE, keywords: ["polisi", "polri", "kapolda jabar"] });
  assert.match(where, /news_title_tsv @@ to_tsquery\('indonesian', \$1\)/);
  assert.equal(values[0], "(polisi & !(polisi <-> tidur)) | (polri) | (kapolda <-> jabar)");
});

test("without keywords nothing is added, and a client-sent pkw is ignored", () => {
  const { where } = buildWhere("social", new URLSearchParams({ pkw: "polisi" }), OPEN_SCOPE);
  assert.doesNotMatch(where, /to_tsquery/);
});

test("search: OR (or '|') alternatives are ORed, words inside one alternative stay ANDed", () => {
  const { where, values } = buildWhere("social", new URLSearchParams({ q: "polisi or polri | kapolda jabar" }), OPEN_SCOPE);
  assert.match(where, /post_content_tsv @@ \(plainto_tsquery\('indonesian', \$\d\) \|\| plainto_tsquery\('indonesian', \$\d\) \|\| plainto_tsquery\('indonesian', \$\d\)\)/);
  assert.deepEqual(values.slice(-3), ["polisi", "polri", "kapolda jabar"]);
});

test("search: a single term and a bare 'or' keep working", () => {
  assert.deepEqual(buildWhere("online", new URLSearchParams({ q: "polisi" }), OPEN_SCOPE).values.slice(-1), ["polisi"]);
  assert.doesNotMatch(buildWhere("online", new URLSearchParams({ q: "or" }), OPEN_SCOPE).where, /plainto_tsquery/);
});
