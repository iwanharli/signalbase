import { formatNumber, humanize } from "./labels";
import type { MediaItem } from "./types";

/** Compact counts for cards; full counts remain available in tooltips and details. */
export function formatMetricCount(value: number): string {
  if (value < 1000) return formatNumber(value);
  const units = [{ divisor: 1e3, suffix: "rb" }, { divisor: 1e6, suffix: "jt" }, { divisor: 1e9, suffix: "M" }];
  let index = value >= 1e9 ? 2 : value >= 1e6 ? 1 : 0;
  if (Math.round(value / units[index].divisor * 10) / 10 >= 1000 && index < units.length - 1) index++;
  const unit = units[index];
  return `${(value / unit.divisor).toLocaleString("id-ID", { maximumFractionDigits: 1 })} ${unit.suffix}`;
}

/** Signals and topics can contain the same label with different casing or separators. */
export function uniqueTags(values: string[]): string[] {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const label = humanize(value).trim().replace(/\s+/g, " ");
    const key = label.toLocaleLowerCase("id-ID");
    if (!key || seen.has(key)) return [];
    seen.add(key);
    return [label];
  });
}

/** An existing analysis row is distinct from the presence of an emotion label. */
export function analysisState(item: Pick<MediaItem, "mood" | "analysis">): "labelled" | "unlabelled" | "pending" {
  if (item.mood?.trim()) return "labelled";
  return item.analysis ? "unlabelled" : "pending";
}

/** Keep unknown language codes visible rather than guessing a language. */
export function languageLabel(value: string | null | undefined): string {
  if (!value?.trim()) return "Belum diketahui";
  const code = value.trim().toLowerCase();
  return ({ id: "Bahasa Indonesia", non_id: "Selain bahasa Indonesia", en: "Bahasa Inggris", ms: "Bahasa Melayu" } as Record<string, string>)[code] ?? `Kode bahasa: ${value.trim()}`;
}

/** Use one explicit timezone throughout media details; invalid dates stay readable. */
export function formatWibDate(value: string | null | undefined): string {
  if (!value) return "Tidak tersedia";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Tidak tersedia";
  return `${new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" }).format(date)} WIB`;
}
