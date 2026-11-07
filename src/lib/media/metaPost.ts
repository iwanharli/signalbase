export type MetaPost = { platform: 'instagram' | 'facebook'; kind: 'post' | 'video'; id: string; url: string };

export function metaPost(value: string | null | undefined): MetaPost | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.port) return null;
    if (['instagram.com', 'www.instagram.com'].includes(u.hostname)) {
      const m = u.pathname.match(/^\/(p|reel|tv)\/([\w-]{5,64})\/?$/);
      if (m) return { platform: 'instagram', kind: m[1] === 'p' ? 'post' : 'video', id: m[2], url: `https://www.instagram.com/${m[1]}/${m[2]}/` };
    }
    if (['facebook.com', 'www.facebook.com', 'm.facebook.com'].includes(u.hostname)) {
      const post = u.pathname.match(/^\/([\w.]+)\/posts\/([\w]{5,200})\/?$/);
      if (post) return { platform: 'facebook', kind: 'post', id: post[2], url: `https://www.facebook.com/${post[1]}/posts/${post[2]}/` };
      const video = u.pathname.match(/^\/(?:reel\/(\d{5,40})|[\w.]+\/videos\/(\d{5,40}))\/?$/);
      if (video) return { platform: 'facebook', kind: 'video', id: video[1] || video[2], url: `https://www.facebook.com${u.pathname.replace(/\/$/, '')}/` };
      if (['/permalink.php', '/story.php'].includes(u.pathname)) {
        const id = u.searchParams.get('story_fbid');
        const owner = u.searchParams.get('id');
        if (id && owner && /^(?:\d{5,40}|pfbid\w{5,195})$/.test(id) && /^\d{5,40}$/.test(owner)) return { platform: 'facebook', kind: 'post', id, url: `https://www.facebook.com/permalink.php?story_fbid=${id}&id=${owner}` };
      }
      const id = u.searchParams.get('v');
      if (['/watch', '/watch/', '/video.php'].includes(u.pathname) && id && /^\d{5,40}$/.test(id)) return { platform: 'facebook', kind: 'video', id, url: `https://www.facebook.com/watch/?v=${id}` };
    }
  } catch { /* Invalid link. */ }
  return null;
}

export function metaEmbedUrl(post: MetaPost, parentOrigin?: string) {
  if (post.platform === 'instagram') {
    const url = new URL(`${post.url}embed/captioned/`);
    // Match embed.js: cr enables resize reporting; rd identifies the parent origin.
    url.searchParams.set('cr', '1');
    url.searchParams.set('v', '14');
    if (parentOrigin) url.searchParams.set('rd', parentOrigin);
    return url.href;
  }
  const u = new URL(`https://www.facebook.com/plugins/${post.kind === 'video' ? 'video' : 'post'}.php`);
  u.searchParams.set('href', post.url);
  u.searchParams.set('width', '500');
  u.searchParams.set('show_text', 'true');
  if (post.kind === 'video') u.searchParams.set('autoplay', 'false');
  return u.href;
}

/** MEASURE heights may be JSON numbers or numeric strings in Instagram embeds. */
export function instagramEmbedHeight(value: unknown): number | null {
  try {
    const data = typeof value === 'string' ? JSON.parse(value) : value;
    if (!data || typeof data !== 'object' || data.type !== 'MEASURE') return null;
    const raw = data.details?.height;
    if (typeof raw !== 'number' && !(typeof raw === 'string' && /^\d+(?:\.\d+)?$/.test(raw))) return null;
    const height = Number(raw);
    return Number.isFinite(height) && height >= 100 && height <= 30000 ? Math.ceil(height) : null;
  } catch { return null; }
}
