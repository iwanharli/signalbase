import assert from "node:assert/strict";
import { test } from "node:test";
import { buildWhere } from "../src/lib/server/bank/query";
import { OPEN_SCOPE } from "../src/lib/media/keyScope";

test("pkw keywords are ORed, phrases stay phrases and 'polisi' excludes 'polisi tidur'", () => {
  const { where, values } = buildWhere("online", new URLSearchParams({ pkw: "polisi\npolri\nkapolda jabar" }), OPEN_SCOPE);
  assert.match(where, /news_title_tsv @@ to_tsquery\('indonesian', \$1\)/);
  assert.equal(values[0], "(polisi & !(polisi <-> tidur)) | (polri) | (kapolda <-> jabar)");
});

test("without pkw nothing is added", () => {
  const { where } = buildWhere("social", new URLSearchParams(), OPEN_SCOPE);
  assert.doesNotMatch(where, /to_tsquery/);
});
