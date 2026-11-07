import { z } from 'zod';
import { publicVideo } from '@/lib/media/publicVideo';
import { createCache } from './bank/cache';

const metadata = z.object({ type: z.literal('video'), title: z.string().max(20000).default(''), author_name: z.string().max(500).default('') });
const cached = createCache<{ title: string; author: string }>({ ttlMs: 5 * 60_000, maxEntries: 300 });

export function originalPublicVideo(value: string) {
  const video = publicVideo(value);
  if (!video) throw new Error('Unsupported video URL');
  return cached(video.url, async () => {
    const endpoint = video.platform === 'youtube' ? 'https://www.youtube.com/oembed' : 'https://www.tiktok.com/oembed';
    const url = new URL(endpoint);
    url.searchParams.set('url', video.url);
    url.searchParams.set('format', 'json');
    const response = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: 'error', cache: 'no-store' });
    if (!response.ok) throw new Error('Public video unavailable');
    const data = metadata.parse(await response.json());
    return { title: data.title, author: data.author_name };
  });
}
