"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { countActive, countAdvanced, defaultFilters, filtersFromSearchParams, toSearchParams, savedFilterParams, savedFiltersKey, savedFilterValue, splitFilterUrl, type MediaFilters } from "@/lib/media/filters";
import type { MediaType } from "@/lib/media/types";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

const SEARCH_DEBOUNCE_MS = 1000;
/** Fewer than MIN_SEARCH_CHARS typed: the word is probably unfinished and matches little, so wait longer before querying. */
const SHORT_SEARCH_DEBOUNCE_MS = 2000;
const MIN_SEARCH_CHARS = 4;

/**
 * Keeps dependent filters consistent:
 * - unanalysed items have no mood, so picking "not analysed" clears mood and intensity;
 * - items the AI excluded are never labelled, so picking "excluded" also drops the analysed filter;
 * - labels and AI categories belong to one project, so switching project drops them (a patch naming them, i.e. an applied
 *   draft, already carries the right ones).
 */
export function applyRules(next: MediaFilters, patch: Partial<MediaFilters>): MediaFilters {
  if ("key" in patch && !("manualLabel" in patch)) return { ...next, aiCategory: null, manualLabel: null };
  if (patch.analyzed === "no") return { ...next, mood: null, minLevel: "" };
  if (patch.relevance === "exclude") return { ...next, analyzed: "", mood: null, minLevel: "" };
  return next;
}

/** The Quick/Original View choice, remembered in this browser. */
export const SOURCE_KEY = "signalbase.media.tampilan";

// Copy for browsers where storage is unavailable, so filters still survive a project switch or a link.
const memory = new Map<string, string>();

function save(storageKey: string, value: string) {
  memory.set(storageKey, value);
  try {
    if (value) localStorage.setItem(storageKey, value);
    else localStorage.removeItem(storageKey);
  } catch { /* storage unavailable */ }
}

function load(type: MediaType, projectId: string | null): MediaFilters {
  const storageKey = savedFiltersKey(type, projectId);
  let value: string | null;
  try { value = localStorage.getItem(storageKey); } catch { value = memory.get(storageKey) ?? null; }
  return { ...filtersFromSearchParams(savedFilterParams(value ?? "", type), type), key: projectId };
}

/**
 * The address bar names only the project: filters (and the view) arriving in a URL are remembered, then removed from it.
 * False until that is done, so the browser starts from the remembered filters.
 */
export function useCleanMediaUrl(type: MediaType) {
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  // The server has no localStorage: nothing that depends on it renders before mounting.
  useEffect(() => setMounted(true), []);
  const search = searchParams.toString();
  const { saved, rest } = splitFilterUrl(new URLSearchParams(search), type);
  const view = rest.get("tampilan");
  const dirty = saved !== null || view !== null;
  useEffect(() => {
    if (!dirty) return;
    const url = new URL(window.location.href);
    const incoming = splitFilterUrl(url.searchParams, type);
    const source = incoming.rest.get("tampilan");
    if (incoming.saved !== null) save(savedFiltersKey(type, incoming.rest.get("key")), incoming.saved);
    if (source === "quick" || source === "asli") {
      try { localStorage.setItem(SOURCE_KEY, source); } catch { /* ignore */ }
    }
    incoming.rest.delete("tampilan");
    url.search = incoming.rest.toString();
    window.history.replaceState(null, "", url);
  }, [dirty, search, type]);
  return mounted && !dirty;
}

/** Filter state of the media browser, remembered per media type and project. Mount only once useCleanMediaUrl is true
 *  and remount per project. */
export function useMediaFilters(type: MediaType) {
  const projectId = useSearchParams().get("key");
  const [stored, setStored] = useState(() => load(type, projectId));
  // The latest filters for updates made before the next render; not re-read from storage, which other tabs share.
  const latest = useRef(stored);
  const filters = useMemo(() => ({ ...stored, key: projectId }), [stored, projectId]);

  const write = useCallback((next: MediaFilters) => {
    save(savedFiltersKey(type, next.key), savedFilterValue(next, type));
    if (next.key === projectId) {
      latest.current = next;
      setStored(next);
      return;
    }
    // Another project: only the URL changes here; the browser remounts and loads what was just saved for it.
    const url = new URL(window.location.href);
    if (next.key) url.searchParams.set("key", next.key);
    else url.searchParams.delete("key");
    window.history.pushState(null, "", url);
  }, [type, projectId]);
  const update = useCallback((patch: Partial<MediaFilters>) => write(applyRules({ ...latest.current, key: projectId, ...patch }, patch)), [write, projectId]);
  // Reset clears the filters, not the project being viewed.
  const reset = useCallback(() => write({ ...defaultFilters(type), key: projectId }), [type, write, projectId]);

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
