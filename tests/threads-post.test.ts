import test from 'node:test';
import assert from 'node:assert/strict';
import { threadsPost, threadsEmbedHeight, threadsEmbedUrl } from '../src/lib/media/threadsPost';
import { originalThreadsPost } from '../src/lib/server/threadsPost';

test('canonicalizes Threads legacy domains and shorthand post links', () => {
  for (const url of ['https://threads.net/@someone/post/CuP48CiS5sx?x=1', 'https://www.threads.com/t/CuP48CiS5sx/', 'https://threads.com/@someone.name/post/CuP48CiS5sx']) {
    const post = threadsPost(url);
    assert.deepEqual(post, { id: 'CuP48CiS5sx', url: 'https://www.threads.com/t/CuP48CiS5sx' });
    assert.equal(threadsEmbedUrl(post!), 'https://www.threads.com/t/CuP48CiS5sx/embed/');
  }
});
test('rejects unsupported hosts, profiles, share redirects and credentials', () => {
  for (const value of ['https://threads.com.evil.test/t/CuP48CiS5sx', 'https://user@threads.com/t/CuP48CiS5sx', 'https://threads.com/@someone', 'https://threads.com/share/123', 'javascript:alert(1)', 'https://threads.com/t/CuP48CiS5sx/extra']) assert.equal(threadsPost(value), null);
});
test('accepts only bounded numeric iframe heights', () => {
  assert.equal(threadsEmbedHeight(534.4), 535);
  assert.equal(threadsEmbedHeight('800'), 800);
  for (const value of [null, {}, -1, Infinity, '500px', 999999, '']) assert.equal(threadsEmbedHeight(value), null);
});
test('uses fixed official oEmbed, validates post identity and caches without exposing HTML', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input, options) => {
    calls++;
    assert.equal(new URL(String(input)).origin, 'https://graph.threads.com');
    assert.equal(options?.redirect, 'error');
    return Response.json({ type: 'rich', provider_name: 'Threads', html: '<blockquote data-text-post-permalink="https://www.threads.com/t/TestPost123"></blockquote><script>ignored()</script>' });
  };
  try {
    assert.deepEqual(await originalThreadsPost('https://threads.net/@test/post/TestPost123'), { url: 'https://www.threads.com/t/TestPost123' });
    await originalThreadsPost('https://threads.com/t/TestPost123');
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});
test('wrong-post and transient errors are not cached', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ type: 'rich', provider_name: 'Threads', html: '<blockquote data-text-post-permalink="https://threads.com/t/OtherPost123"></blockquote>' });
  };
  try {
    for (let n = 0; n < 2; n++) await assert.rejects(originalThreadsPost('https://threads.com/t/Expected123'));
    assert.equal(calls, 2);
  } finally { globalThis.fetch = original; }
});
