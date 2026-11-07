import assert from "node:assert/strict";
import { test } from "node:test";
import pg from "pg";
import { socialMetadataQuery } from "../src/lib/server/bank/socialMetadata";
import { languageLabel } from "../src/lib/media/presentation";

test("language labels preserve unknown and unspecified values", () => {
  assert.equal(languageLabel("id"), "Bahasa Indonesia");
  assert.equal(languageLabel("non_id"), "Selain bahasa Indonesia");
  assert.equal(languageLabel(null), "Belum diketahui");
  assert.equal(languageLabel("xx"), "Kode bahasa: xx");
});

test("keyword metadata skips unusable keywords and keeps user input parameterized", () => {
  const query = socialMetadataQuery(["example"], ["polisi", "polisi", "!!!", "pelayanan publik"]);
  assert.equal(query.keywordRestricted, true);
  assert.deepEqual(query.values[1], ["polisi", "pelayanan publik"]);
  assert.equal(query.text.includes("pelayanan publik"), false);
  assert.equal(socialMetadataQuery(["example"], []).keywordRestricted, false);
});

test("PostgreSQL matches metadata with scope phrase and polisi tidur rules", { skip: !process.env.DATABASE_URL }, async () => {
  // Read-only fixture: no source records are read and no database objects are created.
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000, options: "-c default_transaction_read_only=on" });
  try {
    const codes = ["a", "b", "c", "d"];
    const contents = ["POLISI membantu warga", "Polisi tidur diperbaiki", "Pelayanan publik bersama Polri", "Pelayanan cepat untuk publik"];
    const query = socialMetadataQuery(codes, ["polisi", "pelayanan publik", "polri"]);
    const fixture = `WITH post_main AS (
      SELECT code post_code, 'id'::text post_language, NULL::text post_url, to_tsvector('simple', content) post_content_tsv
      FROM unnest($1::text[], $4::text[]) AS input(code, content)
    ) `;
    const { rows } = await pool.query(fixture + query.text, [...query.values, contents]);
    const matches = new Map(rows.map((row) => [row.code, row.matchedKeywords]));
    assert.deepEqual(matches.get("a"), ["polisi"]);
    assert.deepEqual(matches.get("b"), []);
    assert.deepEqual(matches.get("c"), ["pelayanan publik", "polri"]);
    assert.deepEqual(matches.get("d"), []);
    const unrestricted = socialMetadataQuery(codes, []);
    const result = await pool.query(fixture + unrestricted.text, [...unrestricted.values, contents]);
    assert.ok(result.rows.every((row) => row.language === "id" && row.matchedKeywords.length === 0));
  } finally {
    await pool.end();
  }
});
