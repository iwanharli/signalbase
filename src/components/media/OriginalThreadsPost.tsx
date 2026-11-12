"use client";
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Loader, Tabs } from '@mantine/core';
import { IconBrandThreads, IconDatabase } from '@tabler/icons-react';
import { api } from '@/lib/api-client';
import { threadsEmbedHeight, threadsEmbedUrl, type ThreadsPost } from '@/lib/media/threadsPost';
import { StoredPostFallback } from './StoredPostFallback';
import classes from './originalXPost.module.css';

export function OriginalThreadsPost({ post, fallback, onStatus }: { post: ThreadsPost; fallback: ReactNode; onStatus?: (status: 'ready' | 'failed') => void }) {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [height, setHeight] = useState(500);
  const [tab, setTab] = useState<string | null>('original');
  const [rendered, setRendered] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    setState('loading'); setRendered(false); setHeight(500);
    api<{ post: { url: string } }>(`/api/admin/threads-post?url=${encodeURIComponent(post.url)}`, { signal: controller.signal })
      .then(() => { if (!controller.signal.aborted) setState('ready'); })
      .catch(() => { if (!controller.signal.aborted) setState('failed'); });
    return () => controller.abort();
  }, [post.url, attempt]);
  useEffect(() => {
    if (state !== 'ready' || tab !== 'original') return;
    const timeout = window.setTimeout(() => setState('failed'), 20000);
    function onMessage(event: MessageEvent) {
      if (event.origin !== 'https://www.threads.com' || event.source !== frame.current?.contentWindow) return;
      const next = threadsEmbedHeight(event.data);
      if (next === null) return;
      window.clearTimeout(timeout); setHeight(next); setRendered(true);
    }
    window.addEventListener('message', onMessage);
    return () => { window.clearTimeout(timeout); window.removeEventListener('message', onMessage); };
  }, [state, tab, attempt]);
  useEffect(() => { if (rendered) onStatus?.('ready'); else if (state === 'failed') onStatus?.('failed'); }, [rendered, state, onStatus]);
  if (state !== 'ready') return <StoredPostFallback loading={state === 'loading'} onRetry={() => { setTab('original'); setAttempt((n) => n + 1); }}>{fallback}</StoredPostFallback>;
  return <Tabs value={tab} onChange={setTab} keepMounted={false} className={classes.root}>
    <Tabs.List className={classes.tabsList} aria-label="Sumber konten post">
      <Tabs.Tab value="original" className={classes.tab} leftSection={<IconBrandThreads size={13} aria-hidden />}>Post asli</Tabs.Tab>
      <Tabs.Tab value="stored" className={classes.tab} leftSection={<IconDatabase size={13} aria-hidden />}>Data tersimpan</Tabs.Tab>
    </Tabs.List>
    <Tabs.Panel value="original" className={classes.panel}>
          {!rendered && <div className={classes.loading} role="status"><Loader size={12} color="cyan" />Menyiapkan pratinjau Threads…</div>}
          <iframe key={attempt} ref={frame} src={threadsEmbedUrl(post)} title="Post asli Threads" className={classes.threadsPlayer} style={{ height }} allow="encrypted-media; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" onError={() => setState('failed')} />
          <p className={classes.note}>Pratinjau resmi Threads. Analisis memakai data tersimpan. Jika post tidak tersedia di pemutar, buka tab Data tersimpan.</p>
    </Tabs.Panel>
    <Tabs.Panel value="stored" className={classes.panel}>{fallback}</Tabs.Panel>
  </Tabs>;
}
