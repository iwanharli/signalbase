export type ThreadsPost = { id: string; url: string };

/** Only public post permalinks; profiles, redirects and arbitrary hosts are excluded. */
export function threadsPost(value: string | null | undefined): ThreadsPost | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) return null;
    if (!['threads.com', 'www.threads.com', 'threads.net', 'www.threads.net'].includes(url.hostname)) return null;
    const match = url.pathname.match(/^\/(?:@[\w.]+\/post|t)\/([A-Za-z0-9_-]{5,64})\/?$/);
    if (!match) return null;
    return { id: match[1], url: `https://www.threads.com/t/${match[1]}` };
  } catch { return null; }
}

export function threadsEmbedUrl(post: ThreadsPost) {
  return `${post.url}/embed/`;
}

/** Official embed.js sends its document height as a number. */
export function threadsEmbedHeight(value: unknown): number | null {
  const height = typeof value === 'number' ? value : typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : NaN;
  return Number.isFinite(height) && height >= 100 && height <= 30000 ? Math.ceil(height) : null;
}
