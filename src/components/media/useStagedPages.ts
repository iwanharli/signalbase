"use client";
// Original View feed without pop-in: a page that just arrived is kept out of sight (its cards mounted in place, hidden) while
// the posts' originals load, and shown all at once when every card has settled, or after STAGE_MAX_MS at the latest. The
// next page is fetched well before the bottom (see the browser's sentinel margin), so while scrolling at a normal pace the
// page is usually ready before anyone gets there; only a very fast scroll reaches the skeletons.
import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaItem } from "@/lib/media/types";

/** A page is shown after this long even if some originals are still loading (those swap in when ready). The first page
 *  waits less: someone is looking at the skeletons, whereas later pages are prepared ahead, out of sight. */
export const STAGE_MAX_MS = 10_000;
export const FIRST_PAGE_MAX_MS = 5_000;

export function useStagedPages(items: MediaItem[], enabled: boolean) {
  const [shown, setShown] = useState(0);
  const settled = useRef(new Set<string>());
  const [tick, setTick] = useState(0); // re-render when a card settles

  // A new list (other filters) starts over.
  const first = items[0]?.code;
  useEffect(() => { setShown(0); settled.current = new Set(); }, [first]);

  const visible = enabled ? Math.min(shown, items.length) : items.length;
  const pending = items.slice(visible);
  const ready = pending.every((i) => settled.current.has(i.code));

  // Show the staged page once all its cards settled.
  useEffect(() => {
    if (enabled && pending.length && ready) setShown(items.length);
  }, [enabled, pending.length, ready, items.length, tick]);

  // ...or after STAGE_MAX_MS, so a slow embed never holds the feed.
  const pendingKey = pending[0]?.code;
  useEffect(() => {
    if (!enabled || !pendingKey) return;
    const t = setTimeout(() => setShown(items.length), visible === 0 ? FIRST_PAGE_MAX_MS : STAGE_MAX_MS);
    return () => clearTimeout(t);
  }, [enabled, pendingKey, items.length, visible]);

  const onSettled = useCallback((code: string) => {
    if (settled.current.has(code)) return;
    settled.current.add(code);
    setTick((n) => n + 1);
  }, []);

  return {
    /** Items on screen; the rest are being prepared. */
    visible,
    /** True while a fetched page waits for its originals: fetch nothing more until it is shown. */
    staging: pending.length > 0,
    isStaged: (index: number) => index >= visible,
    onSettled,
  };
}
