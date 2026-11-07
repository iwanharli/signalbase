"use client";
import { useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { countActive, countAdvanced, defaultFilters, filtersFromSearchParams, browserFilterParams, toSearchParams, type MediaFilters } from "@/lib/media/filters";
import type { MediaType } from "@/lib/media/types";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

const SEARCH_DEBOUNCE_MS = 500;

/**
 * Keeps dependent filters consistent:
 * - unanalysed items have no mood, so picking "not analysed" clears mood and intensity;
 * - items the AI excluded are never labelled, so picking "excluded" also drops the analysed filter.
 */
function applyRules(next: MediaFilters, patch: Partial<MediaFilters>): MediaFilters {
  if (patch.analyzed === "no") return { ...next, mood: null, minLevel: "" };
  if (patch.relevance === "exclude") return { ...next, analyzed: "", mood: null, minLevel: "" };
  return next;
}

export function useMediaFilters(type: MediaType) {
  const searchParams = useSearchParams();
  const filters = useMemo(() => filtersFromSearchParams(new URLSearchParams(searchParams.toString()), type), [searchParams, type]);

  const write = useCallback((next: MediaFilters, replace = false) => {
    const url = new URL(window.location.href);
    const params = browserFilterParams(next);
    // Preserve the key context and unrelated URL settings.
    for (const key of ["q", "from", "to", "sort", "source", "mood", "analyzed", "lang", "province", "category", "relevance", "postType", "level", "image", "aiCategory"]) url.searchParams.delete(key);
    params.forEach((value, key) => url.searchParams.set(key, value));
    if (replace) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
  }, []);
  const update = useCallback((patch: Partial<MediaFilters>) => {
    const current = filtersFromSearchParams(new URLSearchParams(window.location.search), type);
    write(applyRules({ ...current, ...patch }, patch), Object.keys(patch).length === 1 && "search" in patch);
  }, [type, write]);
  const reset = useCallback(() => write(defaultFilters(type)), [type, write]);

  // Typing in the search box shouldn't scan the bank on every keystroke.
  const search = useDebouncedValue(filters.search.trim(), SEARCH_DEBOUNCE_MS);
  const query = useMemo(() => toSearchParams({ ...filters, search }).toString(), [filters, search]);

  return {
    filters,
    update,
    reset,
    /** Query string for the item list. */
    query,
    advancedCount: countAdvanced(filters, type),
    activeCount: countActive(filters, type),
  };
}
