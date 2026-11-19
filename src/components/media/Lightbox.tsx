"use client";
// Full-screen image preview for the images of a post: arrows, keyboard (←/→/Esc), swipe on touch screens, a counter and
// thumbnails when there are several. Portalled to <body> above everything, including the detail modal; its keys are
// caught first so Esc closes only the lightbox.
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader } from "@mantine/core";
import { IconChevronLeft, IconChevronRight, IconExternalLink, IconX } from "@tabler/icons-react";
import { videoFrame } from "@/lib/mediaVisual";
import c from "./lightbox.module.css";

export type LightboxImage = { src: string; alt?: string };

export function Lightbox({ images, index, onClose }: { images: LightboxImage[]; index: number | null; onClose: () => void }) {
  const [current, setCurrent] = useState(index ?? 0);
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const touch = useRef<number | null>(null);
  useEffect(() => { if (index !== null) setCurrent(index); }, [index]);
  const open = index !== null && images.length > 0;
  const many = images.length > 1;
  const go = useCallback((by: number) => setCurrent((i) => (i + by + images.length) % images.length), [images.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" && e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      e.stopImmediatePropagation(); // capture phase on window: the detail modal never sees these keys
      if (e.key === "Escape") onClose();
      else if (many) go(e.key === "ArrowLeft" ? -1 : 1);
    };
    window.addEventListener("keydown", onKey, true);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey, true); document.body.style.overflow = overflow; };
  }, [open, many, go, onClose]);

  if (!open || typeof document === "undefined") return null;
  const image = images[current] ?? images[0];
  const frame = videoFrame(image.src);
  // The next and previous image (the same one when there are two), each once.
  const neighbours = many ? [...new Set([images[(current + 1) % images.length].src, images[(current - 1 + images.length) % images.length].src])].filter((src) => src !== image.src) : [];
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return createPortal(
    <div className={c.root} data-many={many || undefined} role="dialog" aria-modal="true" aria-label={`Pratinjau gambar ${current + 1} dari ${images.length}`}
      onClick={(e) => { e.stopPropagation(); onClose(); }}
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touch.current === null || !many) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        touch.current = null;
        if (Math.abs(dx) > 50) go(dx > 0 ? -1 : 1);
      }}>
      <header className={c.bar} onClick={stop}>
        <span className={c.counter}>{many ? `${current + 1} / ${images.length}` : "Pratinjau gambar"}</span>
        <div className={c.tools}>
          <a href={frame?.url ?? image.src} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" title="Buka gambar asli"><IconExternalLink size={18} /></a>
          <button type="button" onClick={onClose} title="Tutup (Esc)" aria-label="Tutup pratinjau"><IconX size={20} /></button>
        </div>
      </header>

      <div className={c.stage}>
        {!loaded[image.src] && <Loader className={c.loader} color="white" size="md" />}
        {frame
          // A video frame (Media visual): the video itself, from that point, with its sound.
          ? <video key={image.src} src={frame.url} controls playsInline autoPlay className={c.image} data-ready={loaded[image.src] || undefined} onClick={stop}
            onLoadedMetadata={(e) => { const v = e.currentTarget; if (Number.isFinite(v.duration)) v.currentTime = v.duration * frame.at; setLoaded((l) => ({ ...l, [image.src]: true })); }}
            onError={() => setLoaded((l) => ({ ...l, [image.src]: true }))} />
          // eslint-disable-next-line @next/next/no-img-element -- remote media from many hosts
          : <img key={image.src} src={image.src} alt={image.alt ?? ""} referrerPolicy="no-referrer" className={c.image} data-ready={loaded[image.src] || undefined}
            onClick={stop} onLoad={() => setLoaded((l) => ({ ...l, [image.src]: true }))} onError={() => setLoaded((l) => ({ ...l, [image.src]: true }))} />}
        {/* Neighbours load in the background so the next step is instant. */}
        {neighbours.filter((src) => !videoFrame(src)).map((src) => <link key={src} rel="preload" as="image" href={src} referrerPolicy="no-referrer" />)}
      </div>

      {image.alt && <p className={c.caption} onClick={stop}>{image.alt}</p>}

      {many && <>
        <button type="button" className={c.nav} data-side="prev" onClick={(e) => { stop(e); go(-1); }} aria-label="Gambar sebelumnya"><IconChevronLeft size={26} /></button>
        <button type="button" className={c.nav} data-side="next" onClick={(e) => { stop(e); go(1); }} aria-label="Gambar berikutnya"><IconChevronRight size={26} /></button>
        <div className={c.thumbs} onClick={stop}>
          {images.map((img, i) => (
            <button key={img.src + i} type="button" data-active={i === current || undefined} onClick={() => setCurrent(i)} aria-label={`Gambar ${i + 1}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.src} alt="" referrerPolicy="no-referrer" loading="lazy" />
            </button>
          ))}
        </div>
      </>}
    </div>,
    document.body,
  );
}
