"use client";
import { useEffect, useState, type ReactNode } from "react";
import { Tabs } from "@mantine/core";
import { IconBrandX, IconChevronDown, IconCornerUpLeft, IconDatabase, IconExternalLink } from "@tabler/icons-react";
import { api } from "@/lib/api-client";
import { formatWibDate } from "@/lib/media/presentation";
import { xVideoFrame, type XPostPreview } from "@/lib/media/xPost";
import { PostText } from "./PostText";
import { StoredPostFallback } from "./StoredPostFallback";
import { PostContent } from "./PostContent";
import classes from "./originalXPost.module.css";

function ReplyContext({ reply }: { reply: NonNullable<XPostPreview["replyTo"]> }) {
  const [parent, setParent] = useState(reply.post);
  const [loading, setLoading] = useState(!reply.post || reply.post.isTruncated);
  useEffect(() => {
    if (reply.post && !reply.post.isTruncated) return;
    const controller = new AbortController();
    api<{ tweet: XPostPreview | null }>(`/api/admin/x-post/${encodeURIComponent(reply.id)}`, { signal: controller.signal })
      .then((result) => {
        const candidate = result.tweet;
        if (!controller.signal.aborted && candidate?.id === reply.id && (!reply.post || !candidate.isTruncated || candidate.text.length > reply.post.text.length)) setParent(candidate);
      })
      .catch(() => { /* The original reply and parent link remain available. */ })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reply.id, reply.post]);
  return <details className={classes.replyContext}>
    <summary className={classes.replyLabel}><IconCornerUpLeft size={14} aria-hidden /><span>Konteks balasan</span>{(parent?.author.handle || reply.handle) && <span className={classes.replyHandle}>@{parent?.author.handle || reply.handle}</span>}<IconChevronDown size={13} className={classes.replyChevron} aria-hidden /></summary>
    <div className={classes.replyBody}>
    {parent ? <div className={classes.parentPost}><strong>{parent.author.name}</strong><p><PostText text={parent.text} /></p></div>
      : <p className={classes.replyNote} role="status">{loading ? "Memuat post yang dibalas…" : "Isi post yang dibalas tidak tersedia dari X."}</p>}
    {parent?.isTruncated && <p className={classes.replyNote} role="status">{loading ? "Mencari teks lengkap dari sumber alternatif…" : "Sumber hanya menyediakan cuplikan. Teks lengkap dapat dibaca melalui tautan di bawah."}</p>}
    <a href={reply.url} target="_blank" rel="noopener noreferrer nofollow" className={classes.parentLink}>Buka post yang dibalas<IconExternalLink size={12} aria-hidden /></a>
    </div>
  </details>;
}

function PreviewContent({ post, quoted = false }: { post: XPostPreview; quoted?: boolean }) {
  const [avatarFailed, setAvatarFailed] = useState(false);
  const author = <div className={classes.author}>
    {post.author.avatar && !avatarFailed
      // eslint-disable-next-line @next/next/no-img-element -- allowlisted X-hosted media
      ? <img src={post.author.avatar} alt="" className={classes.avatar} referrerPolicy="no-referrer" onError={() => setAvatarFailed(true)} />
      : <span className={classes.avatarFallback} aria-hidden>{post.author.name.charAt(0)}</span>}
    <div><strong>{post.author.name}</strong><span>@{post.author.handle}</span></div>
    {!quoted && <a href={post.url} target="_blank" rel="noopener noreferrer nofollow" className={classes.xLogo} aria-label="Buka post di X (tab baru)" title="Buka di X"><IconBrandX size={20} aria-hidden /></a>}
    {quoted && <a href={post.url} target="_blank" rel="noopener noreferrer nofollow" className={classes.source} aria-label="Buka kutipan di X (tab baru)" title="Buka di X"><IconExternalLink size={15} aria-hidden /></a>}
  </div>;
  return <>
    <article className={quoted ? classes.quote : classes.post} data-focused={(!quoted && !!post.replyTo) || undefined}>
    {!quoted && post.replyTo && <span className={classes.focusLabel}>Reply</span>}
    <PostContent text={post.text} header={author} textClassName={quoted ? undefined : classes.xText} metrics={{ likes: post.likes, comments: post.replies, shares: null, views: null }}>
    {post.isTruncated && <p className={classes.note}>Post panjang mungkin terpotong. <a href={post.url} target="_blank" rel="noopener noreferrer">Baca selengkapnya di X</a>.</p>}
    {!!post.media.length && <div className={classes.media}>
      {post.media.map((media) => media.kind === "video"
        ? <iframe key={media.url} {...xVideoFrame(media.url, media.poster)} title={media.alt} sandbox="" allow="fullscreen" allowFullScreen className={classes.xVideo} />
        : <a key={media.url} href={media.url} target="_blank" rel="noopener noreferrer" aria-label="Buka gambar (tab baru)">
          {/* eslint-disable-next-line @next/next/no-img-element -- allowlisted X-hosted media */}
          <img src={media.url} alt={media.alt} loading="lazy" referrerPolicy="no-referrer" />
        </a>)}
    </div>}
    {post.quoted && <PreviewContent post={post.quoted} quoted />}
    {quoted ? <time className={classes.quoteTime} dateTime={post.createdAt}>{formatWibDate(post.createdAt)}</time> : <time className={classes.xTime} dateTime={post.createdAt}>{formatWibDate(post.createdAt)}</time>}
    </PostContent>
  </article>
    {!quoted && post.replyTo && <ReplyContext key={post.replyTo.id} reply={post.replyTo} />}
  </>;
}

export function OriginalXPost({ id, fallback, onStatus }: { id: string; fallback: ReactNode; onStatus?: (status: "ready" | "failed") => void }) {
  const [post, setPost] = useState<XPostPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(false); setPost(null);
    api<{ tweet: XPostPreview | null }>(`/api/admin/x-post/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setPost(result.tweet); })
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, attempt]);
  useEffect(() => { if (!loading) onStatus?.(post ? "ready" : "failed"); }, [loading, post, onStatus]);
  if (loading || !post) return <StoredPostFallback loading={loading} onRetry={error ? () => setAttempt((value) => value + 1) : undefined}>{fallback}</StoredPostFallback>;
  return <Tabs defaultValue="original" keepMounted={false} className={classes.root}>
    <Tabs.List className={classes.tabsList} aria-label="Sumber konten post">
      <Tabs.Tab value="original" className={classes.tab} leftSection={<IconBrandX size={13} aria-hidden />}>Post asli</Tabs.Tab>
      <Tabs.Tab value="stored" className={classes.tab} leftSection={<IconDatabase size={13} aria-hidden />}>Data tersimpan</Tabs.Tab>
    </Tabs.List>
    <Tabs.Panel value="original" className={classes.panel}>
      <PreviewContent post={post} /><p className={classes.note}>{post.provider === "fxtwitter" ? "Dari FxTwitter" : "Dari X"} · dimuat {formatWibDate(post.fetchedAt)}. Analisis memakai data tersimpan.</p>
    </Tabs.Panel>
    <Tabs.Panel value="stored" className={classes.panel}>
      {fallback}
    </Tabs.Panel>
  </Tabs>;
}
