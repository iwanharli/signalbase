"use client";
import { LABEL_FILTER_NAMES } from "@/lib/media/manualLabels";
import { IconFilterOff, IconLock, IconX } from "@tabler/icons-react";
import { DEFAULT_RANGE_DAYS, daysAgo, defaultFilters, rangeLabel, type MediaFilters } from "@/lib/media/filters";
import { humanize, POST_TYPE_LABEL, sourceLabel } from "@/lib/media/labels";
import { moodInfo } from "@/lib/media/mood";
import type { FilterOptions, MediaType } from "@/lib/media/types";
import classes from "./filters.module.css";

/** locked: set by the project's admin (its filter is hidden), so the chip only informs and cannot be removed. */
type Chip = { key: string; label: string; clear: Partial<MediaFilters>; locked?: boolean };
export function ActiveFilters({ type, filters: f, options, onChange, onReset, canReset, locked = {} }: {
  type: MediaType;
  filters: MediaFilters; options: FilterOptions | null; onChange: (patch: Partial<MediaFilters>) => void; onReset: () => void;
  /** Filters the project's admin fixed (their choice is hidden in the drawer): at the default they cannot be removed. */
  locked?: { analyzed?: boolean; relevance?: boolean };
  /** False while every filter is at its default. */
  canReset: boolean;
}) {
  const chips: Chip[] = [];
  const add = (key: string, label: string, clear: Partial<MediaFilters>, isLocked = false) => chips.push({ key, label, clear, locked: isLocked });
  const d = defaultFilters(type);
  if (f.search) add("search", `Pencarian: ${f.search}`, { search: "" });
  // The default range (last 7 days) is not a chip; another range is, and removing it goes back to the default.
  const defaultFrom = daysAgo(DEFAULT_RANGE_DAYS);
  if (f.from !== defaultFrom || f.to) add("date", rangeLabel(f), { from: defaultFrom, to: "" });
  if (f.source) add("source", sourceLabel(f.source), { source: null });
  if (f.mood) add("mood", moodInfo(f.mood).label, { mood: null });
  // Fixed by the admin: at its default the chip is locked; a different value (from a link) can only go back to the default.
  if (f.analyzed) add("analyzed", `${f.analyzed === "yes" ? "Sudah" : "Belum"} dianalisis ${type === "social" ? "emosi" : "sentimen"}`, { analyzed: locked.analyzed ? d.analyzed : "" }, !!locked.analyzed && f.analyzed === d.analyzed);
  if (f.language) add("language", f.language === "id" ? "Bahasa Indonesia" : "Bahasa lain", { language: "" });
  if (f.province) add("province", options?.provinces.find((p) => p.value === f.province)?.label ?? `Provinsi ${f.province}`, { province: null });
  if (f.category) add("category", `Kategori: ${humanize(f.category)}`, { category: null });
  if (f.relevance) add("relevance", ({ relevant: "Sembunyikan yang tidak relevan", include: "Relevan", watchlist: "Watchlist", exclude: "Tidak relevan" })[f.relevance], { relevance: locked.relevance ? d.relevance : "" }, !!locked.relevance && f.relevance === d.relevance);
  if (f.postType) add("postType", POST_TYPE_LABEL[f.postType] ?? f.postType, { postType: "" });
  if (f.minLevel) add("level", `Intensitas ≥ ${f.minLevel}`, { minLevel: "" });
  if (f.withImage) add("image", "Hanya bergambar", { withImage: false });
  if (f.aiCategory) add("aiCategory", f.aiCategory === "*" ? "Sudah dikategorikan AI" : f.aiCategory === "~low" ? "Keyakinan AI rendah" : f.aiCategory === "none" ? "Kategori AI: Tidak termasuk" : `Kategori AI: ${f.aiCategory}`, { aiCategory: null });
  if (f.manualLabel) add("manualLabel", LABEL_FILTER_NAMES[f.manualLabel] ?? `Label: ${f.manualLabel}`, { manualLabel: null });
  if (!chips.length && !canReset) return null;
  return <div className={classes.activeFilters} role="group" aria-label="Filter yang sedang diterapkan">
    {chips.length > 0 && <span>Filter aktif</span>}
    {chips.map((chip) => chip.locked
      ? <span key={chip.key} className={classes.lockedChip} title="Diatur admin di pengaturan proyek">{chip.label}<IconLock size={11} aria-label="dikunci admin" /></span>
      : <button key={chip.key} type="button" onClick={() => onChange(chip.clear)} aria-label={`Hapus filter ${chip.label}`}>{chip.label}<IconX size={12} aria-hidden /></button>)}
    <button type="button" className={classes.resetAll} onClick={onReset} disabled={!canReset}><IconFilterOff size={13} aria-hidden />Reset</button>
  </div>;
}
