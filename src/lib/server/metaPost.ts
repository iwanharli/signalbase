import { z } from 'zod';
import { metaPost } from '@/lib/media/metaPost';
import { createCache } from './bank/cache';

const schema = z.object({ type: z.enum(['rich', 'video']), provider_name: z.enum(['Instagram', 'Facebook']), html: z.string().max(100000) });
const cached = createCache<{ url: string }>({ ttlMs: 300000, maxEntries: 300 });
export function originalMetaPost(value: string) {
  const post = metaPost(value);
  if (!post) throw new Error('Invalid Meta post URL');
  return cached(post.url, async () => {
    const path = post.platform === 'instagram' ? 'instagram_oembed' : post.kind === 'video' ? 'oembed_video' : 'oembed_post';
    const endpoint = new URL(`https://graph.facebook.com/v25.0/${path}`);
    endpoint.searchParams.set('url', post.url);
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(8000), redirect: 'error', cache: 'no-store' });
    if (!response.ok) throw new Error('Meta embed unavailable');
    const data = schema.parse(await response.json());
    if (data.provider_name.toLowerCase() !== post.platform) throw new Error('Wrong provider');
    const link = data.html.match(/(?:data-instgrm-permalink|data-href)=["']([^"']+)["']/)?.[1]?.replace(/&amp;/g, '&');
    const returned = metaPost(link);
    if (!returned || returned.platform !== post.platform || returned.id !== post.id) throw new Error('Wrong post');
    return { url: post.url };
  });
}
