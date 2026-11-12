"use client";
import { useEffect, useRef } from "react";
import { IconAdjustmentsHorizontal, IconFilterOff, IconSearch, IconX } from "@tabler/icons-react";
import { activePreset, DATE_PRESETS, presetRange, type MediaFilters } from "@/lib/media/filters";
import type { MediaType } from "@/lib/media/types";
import { Segmented } from "./controls";
import classes from "./filters.module.css";

const SORT_OPTIONS = [{ value: "newest", label: "Terbaru" }, { value: "oldest", label: "Terlama" }] as const;
const PRESET_OPTIONS = DATE_PRESETS.map((p) => ({ value: p.label, label: p.label }));

/** "/" focuses search from anywhere outside a form field, like most command bars. */
function useSlashToFocus(ref: React.RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key !== "/" || /INPUT|TEXTAREA|SELECT/.test(target.tagName) || target.isContentEditable) return;
      e.preventDefault();
      ref.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ref]);
}

/** Compact toolbar for search, filters, sort and result layout. */
export function QuickFilters({ type, filters, onChange, onReset, activeCount, advancedCount, advancedOpen, onToggleAdvanced, busy, view, onViewChange, source, onSourceChange }: {
  type: MediaType;
  filters: MediaFilters;
  onChange: (patch: Partial<MediaFilters>) => void;
  onReset: () => void;
  activeCount: number;
  advancedCount: number;
  advancedOpen: boolean;
  onToggleAdvanced: () => void;
  busy: boolean;
  view: "cards" | "list";
  onViewChange: (view: "cards" | "list") => void;
  /** Social cards only: the Quick card or the original post. */
  source?: "quick" | "asli";
  onSourceChange?: (source: "quick" | "asli") => void;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  useSlashToFocus(searchRef);
  const preset = activePreset(filters);

  return (
    <section className={classes.quick} data-busy={busy || undefined}>
      <span className={classes.scanline} aria-hidden />
      <button type="button" className={classes.toggle} data-active={advancedOpen || undefined} onClick={onToggleAdvanced}
        aria-label="Filter lanjutan" aria-expanded={advancedOpen} aria-controls="advanced-filters">
        <IconAdjustmentsHorizontal size={18} />
        <span>Filter lanjutan</span>
        {advancedCount > 0 && <b>{advancedCount}</b>}
      </button>

      <label className={classes.search}>
        <IconSearch size={18} />
        <input aria-label={type === "social" ? "Cari isi post" : "Cari judul berita"} ref={searchRef} value={filters.search} onChange={(e) => onChange({ search: e.currentTarget.value })}
          placeholder={type === "social" ? "Cari isi post…" : "Cari judul berita…"} />
        {filters.search
          ? <button type="button" onClick={() => onChange({ search: "" })} aria-label="Hapus pencarian"><IconX size={15} /></button>
          : <kbd>/</kbd>}
      </label>

      <Segmented label="Rentang waktu" className={classes.quickSegmented} options={PRESET_OPTIONS} value={preset?.label ?? ""}
        onChange={(label) => onChange(presetRange(DATE_PRESETS.find((p) => p.label === label)!))} />
      <Segmented label="Urutan" className={classes.sortSegmented} options={SORT_OPTIONS} value={filters.sort} onChange={(sort) => onChange({ sort })} />

      <Segmented label="Tampilan hasil" className={classes.viewSegmented}
        options={[{ value: "cards", label: "Kartu" }, { value: "list", label: "Daftar ringkas" }]} value={view} onChange={onViewChange} />
      {type === "social" && view === "cards" && source && onSourceChange && (
        <Segmented label="Sumber tampilan" className={classes.viewSegmented}
          options={[{ value: "quick", label: "Quick View" }, { value: "asli", label: "Original View" }]} value={source} onChange={onSourceChange} />
      )}

      {activeCount > 0 && <button type="button" className={classes.reset} onClick={onReset}><IconFilterOff size={14} />Reset ke awal · {activeCount}</button>}
    </section>
  );
}
