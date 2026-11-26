// Filter state for the media browser and its mapping to query-string parameters.
// The server reads the same parameter names (see lib/server/bank/query.ts).
import dayjs from "dayjs";
import type { MediaType } from "./types";

export type MediaFilters = {
  search: string;
  from: string;
  to: string;
  sort: "newest" | "oldest";
  source: string | null;
  mood: string | null;
  analyzed: "" | "yes" | "no";
  language: "" | "id" | "other";
  province: string | null;
  category: string | null;
  // Social posts only
  relevance: "" | "relevant" | "include" | "watchlist" | "exclude";
  postType: string;
  minLevel: string;
  // Online news only
  withImage: boolean;
  /** AI category code; only used when browsing through an API key with AI categorisation. */
  aiCategory: string | null;
  /** API key id of the project the bank is viewed as (its whole scope). Page context rather than a filter: reset keeps
   *  it and it is not counted. */
  key: string | null;
  /** Manual label of the project being viewed, or ANY_LABEL for every labelled item. Not AI categorisation. */
  manualLabel: string | null;
};

/** The media pages open on the last 7 days (today and the 6 before); "Semua" is an explicit empty `from`. */
export const DEFAULT_RANGE_DAYS = 6;

export const defaultFilters = (type: MediaType): MediaFilters => ({
  search: "", from: daysAgo(DEFAULT_RANGE_DAYS), to: "", sort: "newest", source: null, mood: null, analyzed: "yes", language: "",
  province: null, category: null, relevance: type === "social" ? "relevant" : "", postType: "", minLevel: "", withImage: false, aiCategory: null, key: null, manualLabel: null,
});

/** Query-string parameters for the API. `search` must already be debounced/trimmed by the caller. */
export function toSearchParams(f: MediaFilters) {
  const p = new URLSearchParams({ sort: f.sort });
  const set = (key: string, value: string | null | false) => { if (value) p.set(key, value); };
  set("q", f.search);
  set("from", f.from);
  set("to", f.to);
  set("source", f.source);
  set("mood", f.mood);
  set("analyzed", f.analyzed);
  set("lang", f.language);
  set("province", f.province);
  set("category", f.category);
  set("relevance", f.relevance);
  set("postType", f.postType);
  set("level", f.minLevel);
  set("image", f.withImage && "yes");
  set("aiCategory", f.aiCategory);
  set("key", f.key);
  set("label", f.manualLabel);
  return p;
}

// Quick date ranges. `days` counts back from today; null means no lower bound.
export const DATE_PRESETS = [
  { label: "1 hari", days: 0 },
  { label: "7 hari", days: 6 },
  { label: "30 hari", days: 29 },
  { label: "Semua", days: null },
] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];

export const daysAgo = (days: number) => dayjs().subtract(days, "day").format("YYYY-MM-DD");

export const presetRange = (preset: DatePreset) => ({ from: preset.days == null ? "" : daysAgo(preset.days), to: "" });

/** The preset the current range corresponds to, if any. */
export function activePreset(f: Pick<MediaFilters, "from" | "to">): DatePreset | undefined {
  if (f.to) return undefined;
  return DATE_PRESETS.find((p) => (p.days == null ? !f.from : f.from === daysAgo(p.days)));
}

export function rangeLabel(f: Pick<MediaFilters, "from" | "to">) {
  const preset = activePreset(f);
  if (preset && preset.days != null) return `${preset.label} terakhir`;
  if (!f.from && !f.to) return "Semua waktu";
  const format = (v: string) => dayjs(v).locale("id").format("D MMM YY");
  return `${f.from ? format(f.from) : "awal"} – ${f.to ? format(f.to) : "kini"}`;
}

/** Number of filters in the advanced drawer that differ from their defaults. */
export function countAdvanced(f: MediaFilters, type: MediaType) {
  const d = defaultFilters(type);
  const customRange = !activePreset(f) && (f.from || f.to);
  return [customRange, f.source, f.mood, f.language, f.analyzed !== d.analyzed, f.province, f.category,
    f.postType, f.minLevel, f.withImage, f.relevance !== d.relevance, f.aiCategory, f.manualLabel].filter(Boolean).length;
}

/** All filters that differ from their defaults, including the quick ones. */
export function countActive(f: MediaFilters, type: MediaType) {
  const preset = activePreset(f);
  return countAdvanced(f, type) + [f.search, !!preset && f.from !== defaultFilters(type).from, f.sort !== "newest"].filter(Boolean).length;
}

/** Explicit empty values preserve “Semua” even when the default is narrower. */
export function filtersFromSearchParams(p: URLSearchParams, type: MediaType): MediaFilters {
  const d = defaultFilters(type);
  const pick = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
    const value = p.get(key);
    return allowed.includes(value as T) ? value as T : fallback;
  };
  const date = (key: string) => {
    const value = p.get(key) ?? "";
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && dayjs(value).isValid() && dayjs(value).format("YYYY-MM-DD") === value ? value : "";
  };
  return {
    ...d, search: p.get("q") ?? "", from: p.get("from") === "" ? "" : date("from") || d.from, to: date("to"), // from absent or unreadable: the default range
    sort: pick("sort", ["newest", "oldest"], d.sort), source: p.get("source") || null,
    mood: p.get("mood") || null, analyzed: pick("analyzed", ["", "yes", "no"], d.analyzed),
    language: pick("lang", ["", "id", "other"], d.language), province: p.get("province") || null,
    category: p.get("category") || null, aiCategory: p.get("aiCategory") || null, key: p.get("key") || null, manualLabel: p.get("label") || null,
    relevance: type === "social" ? pick("relevance", ["", "relevant", "include", "watchlist", "exclude"], d.relevance) : "",
    postType: type === "social" ? pick("postType", ["", "post", "reply", "quote", "repost"], "") : "",
    minLevel: type === "social" ? pick("level", ["", "1", "2", "3", "4", "5"], "") : "",
    withImage: type === "online" && p.get("image") === "yes",
  };
}

/** Browser URLs carry only what differs from the defaults (an absent parameter reads back as the default); an empty
 *  value stays when it means “Semua” and the default is narrower. API requests (toSearchParams) are not trimmed. */
export function browserFilterParams(f: MediaFilters, type: MediaType) {
  const p = toSearchParams(f);
  const d = defaultFilters(type);
  if (f.sort === d.sort) p.delete("sort");
  // The default range is left out of the URL; "Semua" (no start) is kept as an empty from=.
  if (f.from === d.from && !f.to) p.delete("from");
  else p.set("from", f.from);
  for (const name of ["analyzed", "relevance"] as const) {
    if (f[name] === d[name]) p.delete(name);
    else p.set(name, f[name]);
  }
  return p;
}

/** Every browser URL parameter that carries a filter (`key`, the project, is page context and not listed). */
export const FILTER_URL_PARAMS = ["q", "from", "to", "sort", "source", "mood", "analyzed", "lang", "province", "category", "relevance", "postType", "level", "image", "aiCategory", "label"];

/** localStorage keys of the saved filters start with this; one entry per media type and project. */
export const SAVED_FILTERS_PREFIX = "signalbase.media.filter.";
export const savedFiltersKey = (type: MediaType, projectId: string | null) => `${SAVED_FILTERS_PREFIX}${type}.${projectId ?? "bank"}`;

/** What to remember of the filters ("" = all defaults). A quick range is kept as its length, so “7 hari” stays the last
 *  seven days rather than the dates it meant when saved. */
export function savedFilterValue(f: MediaFilters, type: MediaType) {
  const p = browserFilterParams({ ...f, key: null }, type);
  const preset = activePreset(f);
  if (preset?.days != null) {
    p.delete("from");
    if (preset.days !== DEFAULT_RANGE_DAYS) p.set("days", String(preset.days)); // the default range is not saved
  }
  return p.toString();
}

/** The browser URL parameters a saved value stands for today. */
export function savedFilterParams(value: string, type: MediaType) {
  const saved = new URLSearchParams(value);
  // "1" is the former “2 hari” range saved in a browser: it becomes “1 hari” rather than silently showing everything.
  const days = saved.get("days") === "1" ? "0" : saved.get("days");
  const preset = DATE_PRESETS.find((p) => p.days != null && String(p.days) === days);
  const filters = filtersFromSearchParams(saved, type);
  return browserFilterParams(preset ? { ...filters, ...presetRange(preset) } : filters, type);
}

/** Takes the filters off an incoming URL (a link from another page, an old bookmark). `saved` is what to remember for
 *  them ("" = all defaults), or null when the URL names no filter; `rest` is what stays in the address bar. */
export function splitFilterUrl(url: URLSearchParams, type: MediaType) {
  const saved = FILTER_URL_PARAMS.some((name) => url.has(name)) ? savedFilterValue(filtersFromSearchParams(url, type), type) : null;
  const rest = new URLSearchParams(url);
  for (const name of FILTER_URL_PARAMS) rest.delete(name);
  return { saved, rest };
}
