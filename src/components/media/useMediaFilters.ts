"use client";
import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { countActive, countAdvanced, defaultFilters, toSearchParams, type MediaFilters } from "@/lib/media/filters";
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
  // ?mood= lets other pages (e.g. the overview legend) deep-link into a filtered view.
  const initialMood = useSearchParams().get("mood");
  const [filters, setFilters] = useState<MediaFilters>(() => ({ ...defaultFilters(type), mood: initialMood }));

  const update = useCallback((patch: Partial<MediaFilters>) => setFilters((prev) => applyRules({ ...prev, ...patch }, patch)), []);
  const reset = useCallback(() => setFilters(defaultFilters(type)), [type]);

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
