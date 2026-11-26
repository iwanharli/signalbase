"use client";
// Original View card: the Quick card shows at once; the original post loads quietly behind it and replaces it when ready.
// A failed or unsupported original leaves the Quick card as is, without a note (it only distracted).
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconEye } from "@tabler/icons-react";
import { createLimiter } from "@/lib/limiter";
import { originalOf } from "@/lib/media/original";
import type { MediaItem, MediaType } from "@/lib/media/types";
import { moodPolarity } from "@/lib/media/mood";
import { CardFooter, ItemCard, PostAuthor, PostMeta } from "./ItemCard";
import { MoodBadges, moodTone } from "./itemParts";
import { ManualLabelPicker } from "./ManualLabel";
import { CardAiCategory } from "./AiCorrection";
import { SourceSwitch, type SourceView } from "./SourceSwitch";
import { PostContent } from "./PostContent";
import classes from "./originalCard.module.css";

const OriginalXPost = dynamic(() => import("./OriginalXPost").then((m) => m.OriginalXPost));
const OriginalPublicVideo = dynamic(() => import("./OriginalPublicVideo").then((m) => m.OriginalPublicVideo));
const OriginalThreadsPost = dynamic(() => import("./OriginalThreadsPost").then((m) => m.OriginalThreadsPost));
const OriginalMetaPost = dynamic(() => import("./OriginalMetaPost").then((m) => m.OriginalMetaPost));

// Third-party embeds are heavy: at most this many load at once, for cards near the screen or of the page being prepared.
const limiter = createLimiter(6);
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

export function OriginalCard({ item, type, delay, onOpen, eager, onSettled }: {
  item: MediaItem; type: MediaType; delay: number; onOpen: (item: MediaItem) => void;
  /** Load the original now, not when the card nears the screen (the feed prepares the next page out of sight). */
  eager?: boolean;
  /** Called once the card looks final: original shown, original failed, or there is none to load (quick card). */
  onSettled?: (code: string) => void;
}) {
  const original = originalOf(item);
  const wrap = useRef<HTMLDivElement>(null);
  const near = useNearScreen(wrap);
  const manual = original?.kind === "meta"; // Meta gives no sign when a post is private or deleted, so the user asks for it
  const [wanted, setWanted] = useState(false);
  const [granted, setGranted] = useState(false);
  const release = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [view, setView] = useState<SourceView>("original");

  const done = useCallback(() => { release.current?.(); release.current = null; }, []);
  const onStatus = useCallback((s: "ready" | "failed") => { setStatus(s); done(); }, [done]);

  const start = !!original && !manual && (near || !!eager);
  // Nothing to wait for (no original, or Meta which the user opens by hand), or the original has settled.
  const settled = !original || manual || status !== "loading";
  useEffect(() => { if (settled) onSettled?.(item.code); }, [settled, onSettled, item.code]);
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
  const showOriginal = manual ? wanted : status === "ready";
  const fallback = <PostContent text={item.content} title={item.title} metrics={item.metrics} />;
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div ref={wrap} className={classes.wrap}>
      <div className={classes.quick} data-hidden={showOriginal || undefined}>
        <ItemCard item={item} type={type} delay={delay} onOpen={onOpen} notice={
          manual && !wanted ? <button type="button" className={classes.chip} onClick={(e) => { stop(e); setWanted(true); }}><IconEye size={13} aria-hidden />Lihat asli</button>
            : null} loadingOriginal={!manual && mounted && status === "loading"} />
      </div>
      {mounted && (
        <div className={classes.original} data-visible={showOriginal || undefined}>
          <article className={classes.shell} data-polarity={item.mood ? moodPolarity(item.mood) : undefined} style={{ ["--tone" as string]: moodTone(item) }}>
            <ManualLabelPicker item={item} bleed leading={item.classification !== undefined ? <CardAiCategory item={item} /> : null} />
            {/* Right under the AI category and label strip: what kind of post it is, and which version is shown. */}
            <div className={classes.subbar}>
              <PostMeta item={item} />
              {showOriginal && <SourceSwitch value={view} onChange={setView} source={item.source} />}
            </div>
            <header className={classes.head}>
              <PostAuthor item={item} type={type} />
              <MoodBadges item={item} type={type} />
            </header>
            <Clamp>
              {original.kind === "x" && <OriginalXPost id={original.id} fallback={fallback} onStatus={onStatus} inCard view={view} />}
              {original.kind === "video" && <OriginalPublicVideo video={original.video} storedText={item.content} fallback={fallback} onStatus={onStatus} view={view} />}
              {original.kind === "threads" && <OriginalThreadsPost post={original.post} fallback={fallback} onStatus={onStatus} view={view} />}
              {original.kind === "meta" && <OriginalMetaPost post={original.post} fallback={fallback} view={view} />}
            </Clamp>
            <CardFooter item={item} type={type} onOpen={onOpen} />
          </article>
        </div>
      )}
    </div>
  );
}

// A very long original (a Threads thread, a long caption) is cut at this height so the feed's columns stay even.
const CLAMP_PX = 640;

/** Cuts a tall original to CLAMP_PX with a fade; the whole post is in the detail panel (Detail in the footer). */
function Clamp({ children }: { children: React.ReactNode }) {
  const inner = useRef<HTMLDivElement>(null);
  const [long, setLong] = useState(false);
  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setLong(el.scrollHeight > CLAMP_PX + 80)); // a little over is not worth cutting
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className={classes.clamp} data-clamped={long || undefined}>
      <div ref={inner} className={classes.clampInner} style={long ? { maxHeight: CLAMP_PX } : undefined}>{children}</div>
    </div>
  );
}
