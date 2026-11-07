import assert from "node:assert/strict";
import { test } from "node:test";
import { safeSourceUrl, sourceUrl } from "../src/lib/media/sourceUrl";

test("source links only accept absolute HTTP(S) URLs without credentials", () => {
  assert.equal(safeSourceUrl("https://www.threads.net/@example/post/123"), "https://www.threads.net/@example/post/123");
  for (const value of [null, "", "/relative", "javascript:alert(1)", "data:text/html,test", "https://user:password@example.com"]) {
    assert.equal(safeSourceUrl(value), null);
  }
});

test("social links use admin metadata rather than the public URL field", () => {
  const item = { url: "https://example.com/article", socialMetadata: { language: "id", matchedKeywords: [], keywordRestricted: false, sourceUrl: "https://x.com/example/status/123" } };
  assert.equal(sourceUrl(item, "social"), "https://x.com/example/status/123");
  assert.equal(sourceUrl(item, "online"), "https://example.com/article");
  assert.equal(sourceUrl({ ...item, socialMetadata: undefined }, "social"), null);
});
