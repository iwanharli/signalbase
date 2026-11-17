"use client";
import { useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { countActive, countAdvanced, defaultFilters, filtersFromSearchParams, browserFilterParams, toSearchParams, type MediaFilters } from "@/lib/media/filters";
import type { MediaType } from "@/lib/media/types";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

const SEARCH_DEBOUNCE_MS = 1000;
/** Fewer than MIN_SEARCH_CHARS typed: the word is probably unfinished and matches little, so wait longer before querying. */
const SHORT_SEARCH_DEBOUNCE_MS = 2000;
const MIN_SEARCH_CHARS = 4;

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
    for (const key of ["q", "from", "to", "sort", "source", "mood", "analyzed", "lang", "province", "category", "relevance", "postType", "level", "image", "aiCategory", "project", "label"]) url.searchParams.delete(key);
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
  const typed = filters.search.trim();
  // An empty box (cleared) applies at the normal pace.
  const search = useDebouncedValue(typed, typed && typed.length < MIN_SEARCH_CHARS ? SHORT_SEARCH_DEBOUNCE_MS : SEARCH_DEBOUNCE_MS);
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
