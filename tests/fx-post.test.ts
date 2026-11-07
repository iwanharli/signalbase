import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeFxPost } from "../src/lib/server/fxPostData";
import { originalXPost } from "../src/lib/server/xPost";

const fx = (id = "1234567890123456789") => ({
  id, text: "Video &amp; informasi", created_at: "2026-11-06T12:00:00Z",
  author: { name: "Contoh", screen_name: "example", avatar_url: "https://pbs.twimg.com/profile_images/example.jpg" }, likes: 0, replies: 2,
});
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });

test("FxTwitter video, photos, quotes, and reply context use the common preview format", () => {
  const post = normalizeFxPost({ ...fx(), replying_to: "parent", replying_to_status: "234", quote: fx("345"), media: { all: [
    { type: "photo", url: "https://pbs.twimg.com/media/photo.jpg" },
    { type: "video", url: "https://video.twimg.com/example.mp4", thumbnail_url: "https://pbs.twimg.com/media/poster.jpg", format: "video/mp4" },
  ] } });
  assert.equal(post?.provider, "fxtwitter");
  assert.equal(post?.text, "Video & informasi");
  assert.equal(post?.likes, 0);
  assert.deepEqual(post?.media.map((item) => item.kind), ["image", "video"]);
  assert.equal(post?.quoted?.provider, "fxtwitter");
  assert.equal(post?.replyTo?.id, "234");
});

test("FxTwitter legacy media arrays work and unsafe media stay excluded", () => {
  const post = normalizeFxPost({ ...fx(), media: { photos: [{ url: "https://evil.test/photo.jpg" }], videos: [{ url: "https://video.twimg.com/example.mp4", thumbnail_url: "https://pbs.twimg.com/media/poster.jpg" }] } });
  assert.equal(post?.media.length, 1);
  assert.equal(post?.media[0].kind, "video");
  assert.equal(normalizeFxPost({ ...fx(), created_at: "invalid" }), null);
});

test("uses FxTwitter when X fails, and caches the recovered result", async () => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  const id = "112233445566778899";
  globalThis.fetch = async (input) => {
    const host = new URL(String(input)).hostname;
    calls.push(host);
    if (host === "cdn.syndication.twimg.com") throw new Error("X timeout");
    assert.equal(String(input), `https://api.fxtwitter.com/status/${id}`);
    return json({ code: 200, tweet: fx(id) });
  };
  try {
    assert.equal((await originalXPost(id))?.provider, "fxtwitter");
    await originalXPost(id);
    assert.deepEqual(calls, ["cdn.syndication.twimg.com", "api.fxtwitter.com"]);
  } finally { globalThis.fetch = original; }
});

test("missing X posts also try the second source", async (context) => {
  const original = globalThis.fetch;
  context.mock.method(console, "error", () => {});
  const id = "112233445566778900";
  globalThis.fetch = async (input) => new URL(String(input)).hostname === "cdn.syndication.twimg.com" ? json({}) : json({ code: 200, tweet: fx(id) });
  try { assert.equal((await originalXPost(id))?.provider, "fxtwitter"); }
  finally { globalThis.fetch = original; }
});

test("rejects wrong-id fallback responses and retries after both providers fail", async () => {
  const original = globalThis.fetch;
  const id = "112233445566778901";
  globalThis.fetch = async (input) => {
    if (new URL(String(input)).hostname === "cdn.syndication.twimg.com") throw new Error("offline");
    return json({ code: 200, tweet: fx("999") });
  };
  try {
    await assert.rejects(originalXPost(id));
    globalThis.fetch = async (input) => {
      if (new URL(String(input)).hostname === "cdn.syndication.twimg.com") throw new Error("offline");
      return json({ code: 200, tweet: fx(id) });
    };
    assert.equal((await originalXPost(id))?.id, id);
  } finally { globalThis.fetch = original; }
});

test("a confirmed unavailable post from both providers returns the database fallback state", async (context) => {
  const original = globalThis.fetch;
  context.mock.method(console, "error", () => {});
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(null, { status: 404 }); };
  try {
    assert.equal(await originalXPost("112233445566778902"), null);
    assert.equal(await originalXPost("112233445566778902"), null);
    assert.equal(calls, 2);
  } finally { globalThis.fetch = original; }
});

test("long-post excerpts from X also try FxTwitter for the complete text", async () => {
  const original = globalThis.fetch;
  const id = "112233445566778903";
  const fullText = "Post lengkap ".repeat(100);
  globalThis.fetch = async (input) => new URL(String(input)).hostname === "cdn.syndication.twimg.com"
    ? json({ id_str: id, text: "Post lengkap…", created_at: fx(id).created_at, user: { name: "Contoh", screen_name: "example" }, note_tweet: { id: "long" } })
    : json({ code: 200, tweet: { ...fx(id), text: fullText } });
  try {
    const post = await originalXPost(id);
    assert.equal(post?.provider, "fxtwitter");
    assert.equal(post?.text, fullText);
    assert.equal(post?.isTruncated, false);
  } finally { globalThis.fetch = original; }
});

test("a long-post excerpt stays available if the alternate source fails", async () => {
  const original = globalThis.fetch;
  const id = "112233445566778904";
  globalThis.fetch = async (input) => {
    if (new URL(String(input)).hostname === "api.fxtwitter.com") throw new Error("offline");
    return json({ id_str: id, text: "Post panjang…", created_at: fx(id).created_at, user: { name: "Contoh", screen_name: "example" }, note_tweet: { id: "long" } });
  };
  try {
    const post = await originalXPost(id);
    assert.equal(post?.provider, "x");
    assert.equal(post?.text, "Post panjang…");
    assert.equal(post?.isTruncated, true);
  } finally { globalThis.fetch = original; }
});
