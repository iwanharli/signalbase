import { z } from 'zod';
import { threadsPost } from '@/lib/media/threadsPost';
import { createCache } from './bank/cache';

const responseSchema = z.object({ type: z.literal('rich'), provider_name: z.literal('Threads'), html: z.string().max(100000) });
const cached = createCache<{ url: string } | null>({ ttlMs: 5 * 60_000, maxEntries: 300 });

/** The post's embeddable URL, or null when it cannot be shown now. Threads refusing the post (4xx: deleted, private) is
 *  cached, so every card does not wait on Threads again; a transient failure (timeout, 5xx, wrong post) is not. */
export async function originalThreadsPost(value: string) {
  const post = threadsPost(value);
  if (!post) throw new Error('Invalid Threads permalink');
  try {
    return await cached(post.id, async () => {
      const endpoint = new URL('https://graph.threads.com/oembed');
      endpoint.searchParams.set('url', post.url);
      endpoint.searchParams.set('maxwidth', '658');
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(8000), cache: 'no-store', redirect: 'error' });
      if (response.status >= 400 && response.status < 500) return null;
      if (!response.ok) throw new Error('Threads unavailable');
      const data = responseSchema.parse(await response.json());
      // Validate the returned post identity, but never send or execute provider HTML.
      const permalink = data.html.match(/data-text-post-permalink=["']([^"']+)["']/)?.[1];
      if (threadsPost(permalink)?.id !== post.id) throw new Error('Mismatched Threads post');
      return { url: post.url };
    });
  } catch {
    return null;
  }
}
