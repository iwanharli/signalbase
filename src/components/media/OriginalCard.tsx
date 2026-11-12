"use client";
// Original View card: the Quick card shows at once; the original post loads quietly behind it and replaces it when ready.
// A failed or unsupported original leaves the Quick card as is.
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconEye, IconLayoutList } from "@tabler/icons-react";
import { createLimiter } from "@/lib/limiter";
import { originalOf } from "@/lib/media/original";
import type { MediaItem, MediaType } from "@/lib/media/types";
import { ItemCard } from "./ItemCard";
import { PostContent } from "./PostContent";
import classes from "./originalCard.module.css";

const OriginalXPost = dynamic(() => import("./OriginalXPost").then((m) => m.OriginalXPost));
const OriginalPublicVideo = dynamic(() => import("./OriginalPublicVideo").then((m) => m.OriginalPublicVideo));
const OriginalThreadsPost = dynamic(() => import("./OriginalThreadsPost").then((m) => m.OriginalThreadsPost));
const OriginalMetaPost = dynamic(() => import("./OriginalMetaPost").then((m) => m.OriginalMetaPost));

// Third-party embeds are heavy: at most this many load at once, and only for cards near the screen.
const limiter = createLimiter(4);
const GIVE_UP_MS = 30_000;

function useNearScreen(ref: React.RefObject<HTMLElement | null>) {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) setNear(true); }, { rootMargin: "600px 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, near]);
  return near;
}

export function OriginalCard({ item, type, delay, onOpen }: { item: MediaItem; type: MediaType; delay: number; onOpen: (item: MediaItem) => void }) {
  const original = originalOf(item);
  const wrap = useRef<HTMLDivElement>(null);
  const near = useNearScreen(wrap);
  const manual = original?.kind === "meta"; // Meta gives no sign when a post is private or deleted, so the user asks for it
  const [wanted, setWanted] = useState(false);
  const [granted, setGranted] = useState(false);
  const release = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [quick, setQuick] = useState(false);

  const done = useCallback(() => { release.current?.(); release.current = null; }, []);
  const onStatus = useCallback((s: "ready" | "failed") => { setStatus(s); done(); }, [done]);

  const start = !!original && !manual && near;
  useEffect(() => {
    if (!start || granted) return;
    let cancelled = false;
    limiter.acquire().then((rel) => { if (cancelled) rel(); else { release.current = rel; setGranted(true); } });
    return () => { cancelled = true; };
  }, [start, granted]);
  useEffect(() => {
    if (!granted || status !== "loading") return;
    const t = setTimeout(() => { setStatus("failed"); done(); }, GIVE_UP_MS);
    return () => clearTimeout(t);
  }, [granted, status, done]);
  useEffect(() => done, [done]);

  if (!original) return <ItemCard item={item} type={type} delay={delay} onOpen={onOpen} />;

  const mounted = manual ? wanted : granted;
  const showOriginal = !quick && (manual ? wanted : status === "ready");
  const fallback = <PostContent text={item.content} title={item.title} metrics={item.metrics} />;
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div ref={wrap} className={classes.wrap}>
      <div className={classes.quick} data-hidden={showOriginal || undefined}>
        <ItemCard item={item} type={type} delay={delay} onOpen={onOpen} />
        {!manual && mounted && status === "loading" && <span className={classes.shimmer} role="status" aria-label="Memuat tampilan asli" />}
        {manual && !wanted && <button type="button" className={classes.chip} onClick={(e) => { stop(e); setWanted(true); }}><IconEye size={13} aria-hidden />Lihat tampilan asli</button>}
        {quick && (manual ? wanted : status === "ready") && <button type="button" className={classes.chip} onClick={(e) => { stop(e); setQuick(false); }}><IconEye size={13} aria-hidden />Tampilan asli</button>}
        {!manual && status === "failed" && <span className={classes.chip} data-muted>Tampilan asli tidak tersedia</span>}
      </div>
      {mounted && (
        <div className={classes.original} data-visible={showOriginal || undefined}>
          <div className={classes.shell}>
            {original.kind === "x" && <OriginalXPost id={original.id} fallback={fallback} onStatus={onStatus} />}
            {original.kind === "video" && <OriginalPublicVideo video={original.video} storedText={item.content} fallback={fallback} onStatus={onStatus} />}
            {original.kind === "threads" && <OriginalThreadsPost post={original.post} fallback={fallback} onStatus={onStatus} />}
            {original.kind === "meta" && <OriginalMetaPost post={original.post} fallback={fallback} />}
            <footer className={classes.foot}>
              <button type="button" onClick={() => setQuick(true)}><IconLayoutList size={14} aria-hidden />Tampilan Quick</button>
              <button type="button" onClick={() => onOpen(item)}>Detail</button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
