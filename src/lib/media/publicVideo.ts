export type PublicVideo = { platform: "youtube" | "tiktok"; id: string; url: string };

/** Parse canonical public links only; never fetch an arbitrary user-supplied host. */
export function publicVideo(value: string | null | undefined): PublicVideo | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    let id: string | null = null;
    if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be'].includes(host)) {
      id = host.endsWith('youtu.be') ? url.pathname.slice(1) : url.pathname === '/watch' ? url.searchParams.get('v') : url.pathname.match(/^\/(?:shorts|live|embed)\/([^/]+)\/?$/)?.[1] ?? null;
      if (id && /^[\w-]{11}$/.test(id)) return { platform: 'youtube', id, url: `https://www.youtube.com/watch?v=${id}` };
    }
    if (['tiktok.com', 'www.tiktok.com', 'm.tiktok.com'].includes(host)) {
      const match = url.pathname.match(/^\/@([\w.-]+)\/video\/(\d{10,25})\/?$/);
      if (match) return { platform: 'tiktok', id: match[2], url: `https://www.tiktok.com/@${match[1]}/video/${match[2]}` };
    }
  } catch { /* Invalid or unsupported URL. */ }
  return null;
}

export function publicVideoPlayer(video: PublicVideo) {
  return video.platform === 'youtube'
    ? `https://www.youtube.com/embed/${video.id}?autoplay=0&playsinline=1&enablejsapi=1`
    : `https://www.tiktok.com/player/v1/${video.id}?autoplay=0&description=1&music_info=1`;
}
