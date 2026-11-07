import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeXPost } from "../src/lib/server/xPostData";
import { originalXPost } from "../src/lib/server/xPost";

const sample = (id = "1234567890123456789") => ({
  id_str: id, text: "Halo &amp; @polri", created_at: "2026-11-06T12:00:00Z",
  user: { name: "Contoh", screen_name: "example", profile_image_url_https: "https://pbs.twimg.com/profile_images/example.jpg" },
  favorite_count: 0, conversation_count: 3,
});

test("normalizes only preview data and keeps a single quote level", () => {
  const post = normalizeXPost({ ...sample(), note_tweet: { id: "long" }, quoted_tweet: { ...sample("234"), quoted_tweet: sample("345") } });
  assert.equal(post?.text, "Halo & @polri");
  assert.equal(post?.likes, 0);
  assert.equal(post?.url, "https://x.com/example/status/1234567890123456789");
  assert.equal(post?.isTruncated, true);
  assert.equal(post?.quoted?.id, "234");
  assert.equal(post?.quoted?.quoted, null);
  assert.equal(normalizeXPost({ ...sample(), user: null }), null);
});

test("media and avatars are restricted to X media hosts", () => {
  const post = normalizeXPost({ ...sample(), user: { ...sample().user, profile_image_url_https: "https://evil.test/a.jpg" }, mediaDetails: [
    { type: "photo", media_url_https: "https://pbs.twimg.com/media/example.jpg", ext_alt_text: "Foto &amp; informasi" },
    { type: "photo", media_url_https: "https://evil.test/a.jpg" },
    { type: "video", media_url_https: "https://pbs.twimg.com/media/poster.jpg", video_info: { variants: [{ content_type: "video/mp4", url: "https://video.twimg.com/example.mp4", bitrate: 256000 }] } },
  ] });
  assert.equal(post?.author.avatar, null);
  assert.equal(post?.media.length, 2);
  assert.equal(post?.media[0].alt, "Foto & informasi");
  assert.equal(post?.media[1].kind, "video");
});

test("fetches once for concurrent previews, validates upstream ids, and retries failures", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  const id = "998877665544332211";
  globalThis.fetch = async (url) => {
    calls++;
    assert.equal(new URL(String(url)).hostname, "cdn.syndication.twimg.com");
    return new Response(JSON.stringify(sample(id)), { headers: { "Content-Type": "application/json" } });
  };
  try {
    const result = await Promise.all([originalXPost(id), originalXPost(id)]);
    assert.equal(calls, 1);
    assert.equal(result[0]?.id, id);
    globalThis.fetch = async () => { throw new Error("offline"); };
    await assert.rejects(originalXPost("998877665544332212"));
    globalThis.fetch = async () => new Response(JSON.stringify(sample("998877665544332212")), { headers: { "Content-Type": "application/json" } });
    assert.equal((await originalXPost("998877665544332212"))?.id, "998877665544332212");
    assert.throws(() => originalXPost("../invalid"));
    globalThis.fetch = async () => new Response(JSON.stringify(sample("1")), { headers: { "Content-Type": "application/json" } });
    await assert.rejects(originalXPost("998877665544332213"));
  } finally { globalThis.fetch = original; }
});

test("replies preserve the exact parent and do not recursively include a thread", () => {
  const reply = normalizeXPost({ ...sample(), in_reply_to_status_id_str: "234", in_reply_to_screen_name: "parent_user", parent: { ...sample("234"), in_reply_to_status_id_str: "345", parent: sample("345") } });
  assert.equal(reply?.replyTo?.id, "234");
  assert.equal(reply?.replyTo?.url, "https://x.com/parent_user/status/234");
  assert.equal(reply?.replyTo?.post?.text, "Halo & @polri");
  assert.equal(reply?.replyTo?.post?.replyTo, null);
  const missing = normalizeXPost({ ...sample(), in_reply_to_status_id_str: "234" });
  assert.equal(missing?.replyTo?.post, null);
  assert.equal(missing?.replyTo?.url, "https://x.com/i/status/234");
  const mismatch = normalizeXPost({ ...sample(), in_reply_to_status_id_str: "234", parent: sample("999") });
  assert.equal(mismatch?.replyTo?.post, null);
  assert.equal(normalizeXPost(sample())?.replyTo, null);
});
