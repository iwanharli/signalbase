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
};

export const defaultFilters = (type: MediaType): MediaFilters => ({
  search: "", from: "", to: "", sort: "newest", source: null, mood: null, analyzed: "yes", language: "",
  province: null, category: null, relevance: type === "social" ? "relevant" : "", postType: "", minLevel: "", withImage: false, aiCategory: null,
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
  return p;
}

// Quick date ranges. `days` counts back from today; null means no lower bound.
export const DATE_PRESETS = [
  { label: "2 hari", days: 1 },
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
    f.postType, f.minLevel, f.withImage, f.relevance !== d.relevance, f.aiCategory].filter(Boolean).length;
}

/** All filters that differ from their defaults, including the quick ones. */
export function countActive(f: MediaFilters, type: MediaType) {
  const preset = activePreset(f);
  return countAdvanced(f, type) + [f.search, preset && preset.days != null, f.sort !== "newest"].filter(Boolean).length;
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
    ...d, search: p.get("q") ?? "", from: date("from"), to: date("to"),
    sort: pick("sort", ["newest", "oldest"], d.sort), source: p.get("source") || null,
    mood: p.get("mood") || null, analyzed: pick("analyzed", ["", "yes", "no"], d.analyzed),
    language: pick("lang", ["", "id", "other"], d.language), province: p.get("province") || null,
    category: p.get("category") || null, aiCategory: p.get("aiCategory") || null,
    relevance: type === "social" ? pick("relevance", ["", "relevant", "include", "watchlist", "exclude"], d.relevance) : "",
    postType: type === "social" ? pick("postType", ["", "post", "reply", "quote", "repost"], "") : "",
    minLevel: type === "social" ? pick("level", ["", "1", "2", "3", "4", "5"], "") : "",
    withImage: type === "online" && p.get("image") === "yes",
  };
}

/** Browser URLs include explicit defaults; API requests can omit empty filters. */
export function browserFilterParams(f: MediaFilters) {
  const p = toSearchParams(f);
  p.set("analyzed", f.analyzed);
  p.set("relevance", f.relevance);
  return p;
}
