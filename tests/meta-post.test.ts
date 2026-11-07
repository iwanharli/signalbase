import test from 'node:test';
import assert from 'node:assert/strict';
import { instagramEmbedHeight, metaPost, metaEmbedUrl } from '../src/lib/media/metaPost';
import { originalMetaPost } from '../src/lib/server/metaPost';

test('Instagram photo and reel URLs drop tracking parameters', () => {
  const photo = metaPost('https://instagram.com/p/ABCdef123/?igsh=tracking');
  assert.equal(photo?.url, 'https://www.instagram.com/p/ABCdef123/');
  const embed = new URL(metaEmbedUrl(photo!, 'http://localhost:3100'));
  assert.equal(embed.pathname, '/p/ABCdef123/embed/captioned/');
  assert.equal(embed.searchParams.get('cr'), '1');
  assert.equal(embed.searchParams.get('rd'), 'http://localhost:3100');
  assert.equal(metaPost('https://www.instagram.com/reel/ABCdef123/')?.kind, 'video');
});
test('Facebook canonical links include posts, videos, reels and permalink query forms', () => {
  for (const url of ['https://facebook.com/page/posts/pfbid123456', 'https://m.facebook.com/reel/123456789', 'https://facebook.com/page/videos/123456789', 'https://facebook.com/watch/?v=123456789', 'https://facebook.com/permalink.php?story_fbid=123456789&id=987654321']) {
    const post = metaPost(url);
    assert.ok(post);
    const embed = new URL(metaEmbedUrl(post));
    assert.equal(embed.origin, 'https://www.facebook.com');
    assert.equal(embed.searchParams.get('href'), post.url);
  }
});
test('rejects lookalike hosts, credentials, profile links and share redirects', () => {
  for (const url of ['https://instagram.com.evil.test/p/ABCdef123', 'https://user@instagram.com/p/ABCdef123', 'https://facebook.com/share/123456', 'https://instagram.com/profile', 'https://facebook.com/page', 'javascript:alert(1)']) assert.equal(metaPost(url), null);
});
test('fixed oEmbed providers validate identity and return no executable HTML', async () => {
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++;
    assert.equal(new URL(String(input)).origin, 'https://graph.facebook.com');
    assert.equal(init?.redirect, 'error');
    return Response.json({ type: 'rich', provider_name: 'Instagram', html: '<blockquote data-instgrm-permalink="https://instagram.com/p/Test12345/"></blockquote><script>ignored()</script>' });
  };
  try {
    assert.deepEqual(await originalMetaPost('https://instagram.com/p/Test12345/'), { url: 'https://www.instagram.com/p/Test12345/' });
    await originalMetaPost('https://www.instagram.com/p/Test12345/?igsh=test');
    assert.equal(calls, 1);
  } finally { globalThis.fetch = previous; }
});
test('wrong identity and provider failures are rejected and retried', async () => {
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ type: 'rich', provider_name: 'Facebook', html: '<div data-href="https://facebook.com/page/posts/Other12345"></div>' }); };
  try {
    for (let n = 0; n < 2; n++) await assert.rejects(originalMetaPost('https://facebook.com/page/posts/Expected12345'));
    assert.equal(calls, 2);
    globalThis.fetch = async () => new Response('', { status: 503 });
    await assert.rejects(originalMetaPost('https://instagram.com/p/Unavailable123/'));
  } finally { globalThis.fetch = previous; }
});

test('Instagram resize reports support numbers and numeric strings, rejecting invalid messages', () => {
  assert.equal(instagramEmbedHeight(JSON.stringify({ type: 'MEASURE', details: { height: '1248' } })), 1248);
  assert.equal(instagramEmbedHeight({ type: 'MEASURE', details: { height: 918.5 } }), 919);
  for (const value of ['invalid', null, { type: 'MOUNTED', details: { height: 900 } }, { type: 'MEASURE', details: { height: -1 } }, { type: 'MEASURE', details: { height: '900px' } }, { type: 'MEASURE', details: { height: 999999 } }]) assert.equal(instagramEmbedHeight(value), null);
});
