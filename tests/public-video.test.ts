import test from 'node:test';
import assert from 'node:assert/strict';
import { publicVideo, publicVideoPlayer } from '../src/lib/media/publicVideo';
import { originalPublicVideo } from '../src/lib/server/publicVideo';

test('normalizes YouTube watch, short, live and shared URLs', () => {
  for (const url of ['https://youtu.be/M7lc1UVf-VE?si=test', 'https://www.youtube.com/watch?v=M7lc1UVf-VE', 'https://m.youtube.com/shorts/M7lc1UVf-VE', 'https://youtube.com/live/M7lc1UVf-VE']) {
    assert.deepEqual(publicVideo(url), { platform: 'youtube', id: 'M7lc1UVf-VE', url: 'https://www.youtube.com/watch?v=M7lc1UVf-VE' });
  }
});
test('canonical TikTok link produces a player without autoplay', () => {
  const video = publicVideo('https://www.tiktok.com/@scout2015/video/6718335390845095173?lang=en');
  assert.ok(video);
  assert.equal(new URL(publicVideoPlayer(video)).searchParams.get('autoplay'), '0');
});
test('rejects lookalike hosts, credentials, invalid ids and unresolved short links', () => {
  for (const value of ['https://youtube.com.evil.test/watch?v=M7lc1UVf-VE', 'https://user@youtube.com/watch?v=M7lc1UVf-VE', 'javascript:alert(1)', 'https://youtu.be/invalid', 'https://youtu.be/M7lc1UVf-VE/extra', 'https://vm.tiktok.com/example', 'https://tiktok.com/@someone/video/not-an-id']) assert.equal(publicVideo(value), null);
});
test('oEmbed fetch uses fixed providers, caches metadata and ignores external HTML', async () => {
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://www.youtube.com');
    assert.equal(url.pathname, '/oembed');
    assert.equal(init?.redirect, 'error');
    return Response.json({ type: 'video', title: 'Video title', author_name: 'Author', html: '<script>bad()</script>' });
  };
  try {
    const result = await originalPublicVideo('https://youtu.be/abcdefghijk');
    assert.deepEqual(result, { title: 'Video title', author: 'Author' });
    await originalPublicVideo('https://youtube.com/watch?v=abcdefghijk');
    assert.equal(calls, 1);
  } finally { globalThis.fetch = previous; }
});
test('provider failures are retried rather than cached', async () => {
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('', { status: 503 }); };
  try {
    for (let n = 0; n < 2; n++) await assert.rejects(originalPublicVideo('https://youtu.be/12345678901'));
    assert.equal(calls, 2);
  } finally { globalThis.fetch = previous; }
});
