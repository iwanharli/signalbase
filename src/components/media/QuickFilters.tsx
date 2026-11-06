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

/** Search, date presets and sort, plus the toggle for the advanced drawer. */
export function QuickFilters({ type, filters, onChange, onReset, activeCount, advancedCount, advancedOpen, onToggleAdvanced, busy }: {
  type: MediaType;
  filters: MediaFilters;
  onChange: (patch: Partial<MediaFilters>) => void;
  onReset: () => void;
  activeCount: number;
  advancedCount: number;
  advancedOpen: boolean;
  onToggleAdvanced: () => void;
  busy: boolean;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  useSlashToFocus(searchRef);
  const preset = activePreset(filters);

  return (
    <section className={classes.quick} data-busy={busy || undefined}>
      <span className={classes.scanline} aria-hidden />
      <button type="button" className={classes.toggle} data-active={advancedOpen || undefined} onClick={onToggleAdvanced}
        aria-expanded={advancedOpen} aria-controls="advanced-filters">
        <IconAdjustmentsHorizontal size={18} />
        <span>Filter lanjutan</span>
        {advancedCount > 0 && <b>{advancedCount}</b>}
      </button>

      <label className={classes.search}>
        <IconSearch size={18} />
        <input ref={searchRef} value={filters.search} onChange={(e) => onChange({ search: e.currentTarget.value })}
          placeholder={type === "sosial" ? "Cari isi post…" : "Cari judul berita…"} />
        {filters.search
          ? <button type="button" onClick={() => onChange({ search: "" })} aria-label="Hapus pencarian"><IconX size={15} /></button>
          : <kbd>/</kbd>}
      </label>

      <Segmented label="Rentang waktu" className={classes.quickSegmented} options={PRESET_OPTIONS} value={preset?.label ?? ""}
        onChange={(label) => onChange(presetRange(DATE_PRESETS.find((p) => p.label === label)!))} />
      <Segmented label="Urutan" className={classes.quickSegmented} options={SORT_OPTIONS} value={filters.sort} onChange={(sort) => onChange({ sort })} />

      {activeCount > 0 && <button type="button" className={classes.reset} onClick={onReset}><IconFilterOff size={14} />Reset {activeCount}</button>}
    </section>
  );
}
