import assert from "node:assert/strict";
import { test } from "node:test";
import { likePatterns, parseIssueDays, parseIssueTopic, titleFilter, topicTerms } from "../src/lib/issues";

test("only the offered periods are accepted, and 7 days is the default", () => {
  assert.equal(parseIssueDays(null), 7);
  for (const days of [3, 7, 14, 30]) assert.equal(parseIssueDays(String(days)), days);
  for (const bad of ["", "0", "5", "31", "7 days", "7; DROP TABLE x", "-3"]) assert.equal(parseIssueDays(bad), null);
});

test("keywords match literally: LIKE wildcards in a keyword are escaped", () => {
  assert.deepEqual(likePatterns(["polisi", "100%", "a_b", "c\\d"]), ["%polisi%", "%100\\%%", "%a\\_b%", "%c\\\\d%"]);
});

const SKIP_SQL = "ni.title NOT ILIKE $4 AND ni.title NOT ILIKE $5 AND ni.title NOT ILIKE $6 AND ni.title NOT ILIKE $7 AND ni.title NOT ILIKE $8";
const SKIP_PARAMS = ["%zodiak%", "%zodiac%", "%iklan%", "%harga emas%", "%emas antam%"];

test("title filter numbers its parameters from the given start and never inlines keywords", () => {
  assert.deepEqual(titleFilter(["polisi", "polri"], 2), { sql: `(ni.title ILIKE $2 OR ni.title ILIKE $3) AND ${SKIP_SQL}`, params: ["%polisi%", "%polri%", ...SKIP_PARAMS] });
  assert.deepEqual(titleFilter(["x'; --"], 2).params.slice(0, 1), ["%x'; --%"]);
  assert.ok(!titleFilter(["x'; --"], 2).sql.includes("x'"));
});

test("a topic adds its own any-of group between the keywords and the spam skips, with params in the same order", () => {
  const { sql, params } = titleFilter(["kapolri"], 2, ["polisi", "polri", "polda"]);
  assert.equal(sql, "(ni.title ILIKE $2) AND (ni.title ILIKE $3 OR ni.title ILIKE $4 OR ni.title ILIKE $5) AND ni.title NOT ILIKE $6 AND ni.title NOT ILIKE $7 AND ni.title NOT ILIKE $8 AND ni.title NOT ILIKE $9 AND ni.title NOT ILIKE $10");
  assert.deepEqual(params, ["%kapolri%", "%polisi%", "%polri%", "%polda%", ...SKIP_PARAMS]);
  assert.match(titleFilter([], 2, ["polisi"]).sql, /^TRUE AND \(ni\.title ILIKE \$2\) AND ni\.title NOT ILIKE \$3/);
});

test("only the listed topics are accepted, and Isu Nasional is the default", () => {
  assert.equal(parseIssueTopic(null), "nasional");
  assert.equal(parseIssueTopic("polisi"), "polisi");
  for (const bad of ["", "Polisi", "polda", "x'; --"]) assert.equal(parseIssueTopic(bad), null);
  assert.deepEqual(topicTerms("nasional"), []);
  assert.deepEqual(topicTerms("polisi"), ["polisi", "polri", "polda"]);
});

test("no keywords means no keyword restriction, but spam titles are still skipped", () => {
  assert.deepEqual(titleFilter([], 2), {
    sql: "TRUE AND ni.title NOT ILIKE $2 AND ni.title NOT ILIKE $3 AND ni.title NOT ILIKE $4 AND ni.title NOT ILIKE $5 AND ni.title NOT ILIKE $6", params: SKIP_PARAMS,
  });
});
