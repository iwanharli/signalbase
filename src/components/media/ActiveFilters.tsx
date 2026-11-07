"use client";
import { IconX } from "@tabler/icons-react";
import { rangeLabel, type MediaFilters } from "@/lib/media/filters";
import { humanize, POST_TYPE_LABEL, sourceLabel } from "@/lib/media/labels";
import { moodInfo } from "@/lib/media/mood";
import type { FilterOptions } from "@/lib/media/types";
import classes from "./filters.module.css";

type Chip = { key: string; label: string; clear: Partial<MediaFilters> };
export function ActiveFilters({ filters: f, options, onChange }: {
  filters: MediaFilters; options: FilterOptions | null; onChange: (patch: Partial<MediaFilters>) => void;
}) {
  const chips: Chip[] = [];
  const add = (key: string, label: string, clear: Partial<MediaFilters>) => chips.push({ key, label, clear });
  if (f.search) add("search", `Pencarian: ${f.search}`, { search: "" });
  if (f.from || f.to) add("date", rangeLabel(f), { from: "", to: "" });
  if (f.source) add("source", sourceLabel(f.source), { source: null });
  if (f.mood) add("mood", moodInfo(f.mood).label, { mood: null });
  if (f.analyzed) add("analyzed", f.analyzed === "yes" ? "Sudah dianalisis sumber" : "Belum dianalisis sumber", { analyzed: "" });
  if (f.language) add("language", f.language === "id" ? "Bahasa Indonesia" : "Bahasa lain", { language: "" });
  if (f.province) add("province", options?.provinces.find((p) => p.value === f.province)?.label ?? `Provinsi ${f.province}`, { province: null });
  if (f.category) add("category", `Kategori: ${humanize(f.category)}`, { category: null });
  if (f.relevance) add("relevance", ({ relevant: "Sembunyikan yang tidak relevan", include: "Relevan", watchlist: "Watchlist", exclude: "Tidak relevan" })[f.relevance], { relevance: "" });
  if (f.postType) add("postType", POST_TYPE_LABEL[f.postType] ?? f.postType, { postType: "" });
  if (f.minLevel) add("level", `Intensitas ≥ ${f.minLevel}`, { minLevel: "" });
  if (f.withImage) add("image", "Hanya bergambar", { withImage: false });
  if (f.aiCategory) add("aiCategory", f.aiCategory === "*" ? "Sudah dikategorikan AI" : f.aiCategory === "~low" ? "Keyakinan AI rendah" : f.aiCategory === "none" ? "Kategori AI: Tidak termasuk" : `Kategori AI: ${f.aiCategory}`, { aiCategory: null });
  const visible = chips;
  if (!visible.length) return null;
  return <div className={classes.activeFilters} role="group" aria-label="Filter yang sedang diterapkan">
    <span>Filter aktif</span>
    {visible.map((chip) => <button key={chip.key} type="button" onClick={() => onChange(chip.clear)} aria-label={`Hapus filter ${chip.label}`}>{chip.label}<IconX size={14} aria-hidden /></button>)}
  </div>;
}
