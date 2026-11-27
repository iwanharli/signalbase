import { test } from "node:test";
import assert from "node:assert/strict";
import { groupKeywords, groupNames, parseKeywordGroups, UNGROUPED } from "../src/lib/media/keywordGroups";

test("parseKeywordGroups keeps only the project's keywords and tidy, non-empty names", () => {
  assert.deepEqual(parseKeywordGroups({ polisi: "  Umum ", polri: "", hantu: "X", polres: 5 }, ["polisi", "polri", "polres"]), { polisi: "Umum" });
  assert.deepEqual(parseKeywordGroups(null, ["polisi"]), {});
  assert.deepEqual(parseKeywordGroups(["a"], ["polisi"]), {});
});

test("groupKeywords: groups in list order, ungrouped keywords last", () => {
  const keywords = ["polisi", "oknum kapolres", "pungli", "oknum bripka", "propam"];
  const groups = { "oknum kapolres": "Jabatan", pungli: "Integritas", "oknum bripka": "Pangkat" };
  assert.deepEqual(groupKeywords(keywords, groups), [
    { name: "Jabatan", keywords: ["oknum kapolres"] },
    { name: "Integritas", keywords: ["pungli"] },
    { name: "Pangkat", keywords: ["oknum bripka"] },
    { name: UNGROUPED, keywords: ["polisi", "propam"] },
  ]);
  assert.deepEqual(groupNames(keywords, groups), ["Jabatan", "Integritas", "Pangkat"]);
});
