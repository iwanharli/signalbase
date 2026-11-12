"use client";
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Tabs } from '@mantine/core';
import { IconDatabase, IconPlayerPlay } from '@tabler/icons-react';
import { api } from '@/lib/api-client';
import { publicVideoPlayer, type PublicVideo } from '@/lib/media/publicVideo';
import { StoredPostFallback } from './StoredPostFallback';
import { PostContent } from './PostContent';
import classes from './originalXPost.module.css';

type Metadata = { title: string; author: string };
export function OriginalPublicVideo({ video, fallback, storedText, onStatus }: { video: PublicVideo; fallback: ReactNode; storedText: string | null; onStatus?: (status: 'ready' | 'failed') => void }) {
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);
  const label = video.platform === 'youtube' ? 'YouTube' : 'TikTok';
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setFailed(false); setMetadata(null);
    api<{ video: Metadata }>(`/api/admin/public-video?url=${encodeURIComponent(video.url)}`, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setMetadata(data.video); })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [video.url, attempt]);
  useEffect(() => {
    function message(event: MessageEvent) {
      if (event.source !== frame.current?.contentWindow) return;
      if (video.platform === 'youtube' && event.origin === 'https://www.youtube.com') {
        try {
          const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          if (data?.event === 'onError') setFailed(true);
        } catch { /* Ignore unrelated player messages. */ }
      }
      if (video.platform === 'tiktok' && event.origin === 'https://www.tiktok.com' && event.source === frame.current?.contentWindow && event.data?.['x-tiktok-player'] === true && event.data.type === 'onPlayerError') setFailed(true);
    }
    window.addEventListener('message', message);
    return () => window.removeEventListener('message', message);
  }, [video.platform]);
  useEffect(() => { if (!loading) onStatus?.(failed || !metadata ? 'failed' : 'ready'); }, [loading, failed, metadata, onStatus]);
  if (loading || failed || !metadata) return <StoredPostFallback loading={loading} onRetry={() => setAttempt((n) => n + 1)}>{fallback}</StoredPostFallback>;
  const originalText = metadata.title.trim();
  const caption = originalText || storedText?.trim() || null;
  const usesStoredCaption = !originalText && !!caption;
  return <Tabs defaultValue="original" keepMounted={false} className={classes.root}>
    <Tabs.List className={classes.tabsList} aria-label="Sumber konten post">
      <Tabs.Tab value="original" className={classes.tab} leftSection={<IconPlayerPlay size={13} aria-hidden />}>Post asli</Tabs.Tab>
      <Tabs.Tab value="stored" className={classes.tab} leftSection={<IconDatabase size={13} aria-hidden />}>Data tersimpan</Tabs.Tab>
    </Tabs.List>
    <Tabs.Panel value="original" className={classes.panel}>
          <PostContent hideEmptyText text={caption} metrics={{ likes: null, comments: null, shares: null, views: null }} header={<>
            {metadata.author && <div className={classes.author}><strong>{metadata.author}</strong></div>}
            {usesStoredCaption && <span className={classes.captionSource}><IconDatabase size={12} aria-hidden />Caption dari Bankomen</span>}
          </>}>
            <iframe ref={frame} className={classes.videoPlayer} data-platform={video.platform} src={publicVideoPlayer(video)} title={`Video ${label}: ${metadata.title.slice(0, 120)}`} allow="encrypted-media; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" onError={() => setFailed(true)} onLoad={() => {
              if (video.platform === 'youtube') {
                const target = frame.current?.contentWindow;
                target?.postMessage(JSON.stringify({ event: 'listening', id: video.id }), 'https://www.youtube.com');
                target?.postMessage(JSON.stringify({ event: 'command', func: 'addEventListener', args: ['onError'], id: video.id }), 'https://www.youtube.com');
              }
            }} />
          </PostContent>
          <p className={classes.note}>Pratinjau dari {label}. Analisis memakai data tersimpan. Jika pemutar tidak tersedia, buka tab Data tersimpan atau tautan asli di atas.</p>
    </Tabs.Panel>
    <Tabs.Panel value="stored" className={classes.panel}>{fallback}</Tabs.Panel>
  </Tabs>;
}
