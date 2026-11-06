"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import type { MediaItem, MediaType, MoodCount } from "@/lib/media/types";

type PageResponse = { page: number; hasMore: boolean; moods: MoodCount[] | null; items: MediaItem[] };

/**
 * Paged item list for one filter query. Starts over whenever `query` changes and
 * appends further pages on `loadMore`. Responses for an outdated query are ignored.
 */
export function useMediaFeed(type: MediaType, query: string) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  // The breakdown comes with page 1 only.
  const [moods, setMoods] = useState<MoodCount[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const fetchPage = useCallback((pageNumber: number) => {
    const current = generation.current;
    const stale = () => current !== generation.current;
    setLoading(true);
    setError(null);
    api<PageResponse>(`/api/admin/media/${type}?${query}&page=${pageNumber}`)
      .then((res) => {
        if (stale()) return;
        setPage(res.page);
        setHasMore(res.hasMore);
        if (res.moods) setMoods(res.moods);
        setItems((prev) => {
          if (pageNumber === 1) return res.items;
          const seen = new Set(prev.map((i) => i.code));
          return [...prev, ...res.items.filter((i) => !seen.has(i.code))];
        });
      })
      .catch((e: Error) => { if (!stale()) setError(e.message); })
      .finally(() => { if (!stale()) setLoading(false); });
  }, [type, query]);

  // New filters: discard the current list and load page 1.
  useEffect(() => {
    generation.current++;
    setItems([]);
    setPage(0);
    setHasMore(false);
    setMoods(null);
    fetchPage(1);
  }, [fetchPage]);

  const loadMore = useCallback(() => fetchPage(page + 1), [fetchPage, page]);
  const retry = useCallback(() => fetchPage(page ? page + 1 : 1), [fetchPage, page]);

  return { items, hasMore, moods, loading, error, loaded: page > 0, loadMore, retry };
}

/** Calls `onReach` when the returned ref's element comes within `margin` of the viewport. */
export function useInfiniteScroll(enabled: boolean, onReach: () => void, margin = "800px") {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) onReach(); }, { rootMargin: `${margin} 0px` });
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled, onReach, margin]);
  return ref;
}
