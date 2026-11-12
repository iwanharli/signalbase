import assert from "node:assert/strict";
import { test } from "node:test";
import { createLimiter } from "../src/lib/limiter";
import { originalOf } from "../src/lib/media/original";

const item = (sourceUrl: string | null) => ({ socialMetadata: { sourceUrl, language: null, matchedKeywords: [], keywordRestricted: false } });

test("limiter lets `max` through and releases waiters in order, each release counted once", async () => {
  const limiter = createLimiter(2);
  const order: number[] = [];
  const a = await limiter.acquire(), b = await limiter.acquire();
  const c = limiter.acquire().then((r) => { order.push(3); return r; });
  const d = limiter.acquire().then((r) => { order.push(4); return r; });
  await Promise.resolve();
  assert.deepEqual(order, []);
  a(); a(); // the second call must not free another slot
  const rc = await c;
  assert.deepEqual(order, [3]);
  b();
  await d;
  assert.deepEqual(order, [3, 4]);
  rc();
});

test("the viewer follows the post URL; unsupported or missing URLs have none", () => {
  assert.deepEqual(originalOf(item("https://x.com/someone/status/1234567890123")), { kind: "x", id: "1234567890123" });
  assert.equal(originalOf(item("https://www.youtube.com/watch?v=dQw4w9WgXcQ"))?.kind, "video");
  assert.equal(originalOf(item("https://www.threads.com/t/Abc123XyZ"))?.kind, "threads");
  assert.equal(originalOf(item("https://www.instagram.com/p/AbCdEf12345/"))?.kind, "meta");
  assert.equal(originalOf(item("https://example.com/post/1")), null);
  assert.equal(originalOf(item(null)), null);
  assert.equal(originalOf({}), null);
});
