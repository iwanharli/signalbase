"use client";
import type { SourceView } from "./SourceSwitch";
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Tabs } from '@mantine/core';
import { IconDatabase } from '@tabler/icons-react';
import { api } from '@/lib/api-client';
import { instagramEmbedHeight, metaEmbedUrl, type MetaPost } from '@/lib/media/metaPost';
import { PlatformMark } from './PlatformIcon';
import { StoredPostFallback } from './StoredPostFallback';
import classes from './originalXPost.module.css';

/** view: the card shows its own "Post asli / Data tersimpan" switch and sets the tab; the list here is then hidden. */
export function OriginalMetaPost({ post, fallback, view }: { post: MetaPost; fallback: ReactNode; view?: SourceView }) {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [ownTab, setTab] = useState<string | null>('original');
  const tab = view ?? ownTab;
  const [height, setHeight] = useState(680);
  const [parentOrigin, setParentOrigin] = useState<string>();
  const frame = useRef<HTMLIFrameElement>(null);
  const label = post.platform === 'instagram' ? 'Instagram' : 'Facebook';
  useEffect(() => {
    const controller = new AbortController();
    setState('loading'); setHeight(680); setParentOrigin(window.location.origin);
    api(`/api/admin/meta-post?url=${encodeURIComponent(post.url)}`, { signal: controller.signal })
      .then(() => { if (!controller.signal.aborted) setState('ready'); })
      .catch(() => { if (!controller.signal.aborted) setState('failed'); });
    return () => controller.abort();
  }, [post.url, attempt]);
  useEffect(() => {
    if (state !== 'ready' || tab !== 'original') return;
    const timeout = window.setTimeout(() => setState('failed'), 20000);
    const current = frame.current;
    const loaded = () => window.clearTimeout(timeout);
    current?.addEventListener('load', loaded);
    function message(event: MessageEvent) {
      if (event.source !== frame.current?.contentWindow || event.origin !== `https://www.${post.platform}.com`) return;
      if (post.platform === 'instagram') {
        const measured = instagramEmbedHeight(event.data);
        if (measured !== null) { window.clearTimeout(timeout); setHeight(measured); }
      }
    }
    window.addEventListener('message', message);
    return () => { window.clearTimeout(timeout); current?.removeEventListener('load', loaded); window.removeEventListener('message', message); };
  }, [state, tab, post.platform]);
  if (state !== 'ready') return <StoredPostFallback loading={state === 'loading'} onRetry={() => { setTab('original'); setAttempt((n) => n + 1); }}>{fallback}</StoredPostFallback>;
  return <Tabs value={tab} onChange={setTab} keepMounted={false} className={classes.root}>
    {view === undefined && <>
    <Tabs.List className={classes.tabsList} aria-label="Sumber konten post">
      <Tabs.Tab value="original" className={classes.tab} leftSection={<PlatformMark source={post.platform} size={13} />}>Post asli</Tabs.Tab>
      <Tabs.Tab value="stored" className={classes.tab} leftSection={<IconDatabase size={13} aria-hidden />}>Data tersimpan</Tabs.Tab>
    </Tabs.List>
    </>}
    <Tabs.Panel value="original" className={classes.panel}>
      <iframe ref={frame} key={attempt} src={metaEmbedUrl(post, parentOrigin)} scrolling={post.platform === 'instagram' ? 'no' : undefined} className={classes.metaPlayer} style={{ height }} title={`Post asli ${label}`} allow="encrypted-media; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" onError={() => setState('failed')} />
      <button type="button" className={classes.useStored} onClick={() => setState('failed')}>Pratinjau tidak tampil? Gunakan data Bankomen</button>
    </Tabs.Panel>
    <Tabs.Panel value="stored" className={classes.panel}>{fallback}</Tabs.Panel>
  </Tabs>;
}
