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
};

export const defaultFilters = (type: MediaType): MediaFilters => ({
  search: "", from: "", to: "", sort: "newest", source: null, mood: null, analyzed: "yes", language: "",
  province: null, category: null, relevance: type === "sosial" ? "relevant" : "", postType: "", minLevel: "", withImage: false,
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
  return p;
}

// Quick date ranges. `days` counts back from today; null means no lower bound.
export const DATE_PRESETS = [
  { label: "24 jam", days: 1 },
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
    f.postType, f.minLevel, f.withImage, f.relevance !== d.relevance].filter(Boolean).length;
}

/** All filters that differ from their defaults, including the quick ones. */
export function countActive(f: MediaFilters, type: MediaType) {
  const preset = activePreset(f);
  return countAdvanced(f, type) + [f.search, preset && preset.days != null, f.sort !== "newest"].filter(Boolean).length;
}
