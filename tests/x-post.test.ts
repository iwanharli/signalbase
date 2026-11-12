import assert from "node:assert/strict";
import { test } from "node:test";
import { isXPostId, xPostId, xVideoFrame } from "../src/lib/media/xPost";

test("extracts X ids without losing precision and tolerates source URL variants", () => {
  const id = "1234567890123456789";
  for (const url of [`https://x.com/example/status/${id}?s=20`, `https://twitter.com/example/status/${id}/photo/1`, `https://mobile.twitter.com/example/status/${id}`, `https://x.com/i/web/status/${id}`]) assert.equal(xPostId(url), id);
});

test("refuses other platforms, deceptive hosts, credentials and invalid ids", () => {
  for (const url of [null, "https://threads.net/@example/post/123", "https://x.com.evil.test/user/status/123", "https://evil.test/x.com/user/status/123", "https://user:secret@x.com/user/status/123", "https://x.com/user/status/abc", "https://x.com/user", "https://x.com:444/user/status/123"]) assert.equal(xPostId(url), null);
  assert.equal(isXPostId("1234567890123456789"), true);
  assert.equal(isXPostId("../123"), false);
  assert.equal(isXPostId("1".repeat(41)), false);
});

test("video frame drops the Referer, escapes the url and keeps the portrait ratio", () => {
  const { srcDoc, style } = xVideoFrame('https://video.twimg.com/a/vid/avc1/1080x1920/x.mp4?tag=29&a="b"', null);
  assert.match(srcDoc, /name="referrer" content="no-referrer"/);
  assert.match(srcDoc, /tag=29&amp;a=&quot;b&quot;/);
  assert.equal(style.aspectRatio, "1080 / 1920");
  assert.equal(xVideoFrame("https://video.twimg.com/x.mp4", null).style.aspectRatio, "16 / 9");
});
