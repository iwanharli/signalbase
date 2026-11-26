"use client";
import { useEffect, useRef, useState } from "react";
import { Menu } from "@mantine/core";
import { IconAdjustmentsHorizontal, IconCheck, IconLayoutColumns, IconSearch, IconX } from "@tabler/icons-react";
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

/**
 * The search text typed in the box. `filters.search` comes back from the URL a moment after each keystroke; feeding it
 * straight into the input made React reset the caret to the end whenever the stale value landed mid-edit. The input keeps
 * its own text and only takes `filters.search` when it changes from outside (reset, clearing a chip, browser back).
 */
function useSearchText(search: string, onChange: (patch: Partial<MediaFilters>) => void) {
  const [text, setText] = useState(search);
  const sent = useRef<string[]>([search]); // values typed whose echo from the URL may still be on its way
  useEffect(() => {
    const own = sent.current.includes(search);
    if (!own) setText(search);
    sent.current = own && search === sent.current[sent.current.length - 1] ? [search] : own ? sent.current : [search];
  }, [search]);
  const change = (value: string) => {
    setText(value);
    sent.current.push(value);
    onChange({ search: value });
  };
  return [text, change] as const;
}

/** Compact toolbar for search, filters, sort and result layout. */
export function QuickFilters({ type, filters, onChange, advancedCount, advancedOpen, onToggleAdvanced, busy, source, onSourceChange, columns, onColumnsChange, children }: {
  type: MediaType;
  filters: MediaFilters;
  onChange: (patch: Partial<MediaFilters>) => void;
  advancedCount: number;
  advancedOpen: boolean;
  onToggleAdvanced: () => void;
  busy: boolean;
  /** Social cards only: the Quick card or the original post. */
  source?: "quick" | "asli";
  onSourceChange?: (source: "quick" | "asli") => void;
  /** Grid columns (1-4) and how to change them. */
  columns?: number;
  onColumnsChange?: (n: number) => void;
  /** A second row under the controls (the active filters). */
  children?: React.ReactNode;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  useSlashToFocus(searchRef);
  const preset = activePreset(filters);
  const [searchText, changeSearch] = useSearchText(filters.search, onChange);

  return (
    <section className={classes.quick} data-busy={busy || undefined}>
      <span className={classes.scanline} aria-hidden />
      <button type="button" className={classes.toggle} data-active={advancedOpen || undefined} onClick={onToggleAdvanced}
        aria-label="Filter lanjutan" aria-expanded={advancedOpen} aria-controls="advanced-filters">
        <IconAdjustmentsHorizontal size={16} />
        <span>Filter lanjutan</span>
        {advancedCount > 0 && <b>{advancedCount}</b>}
      </button>

      <label className={classes.search}>
        <IconSearch size={16} />
        <input aria-label={type === "social" ? "Cari isi post" : "Cari judul berita"} ref={searchRef} value={searchText} onChange={(e) => changeSearch(e.currentTarget.value)}
          placeholder={type === "social" ? 'Cari isi post…  "frasa persis", @akun, OR' : 'Cari judul berita…  "frasa persis", @penulis, OR'} />
        {searchText
          ? <button type="button" onClick={() => changeSearch("")} aria-label="Hapus pencarian"><IconX size={15} /></button>
          : <kbd>/</kbd>}
      </label>

      <Segmented label="Rentang waktu" className={classes.quickSegmented} options={PRESET_OPTIONS} value={preset?.label ?? ""}
        onChange={(label) => onChange(presetRange(DATE_PRESETS.find((p) => p.label === label)!))} />
      <Segmented label="Urutan" className={classes.sortSegmented} options={SORT_OPTIONS} value={filters.sort} onChange={(sort) => onChange({ sort })} />

      {type === "social" && source && onSourceChange && (
        <Segmented label="Sumber tampilan" className={classes.viewSegmented}
          options={[{ value: "quick", label: "Quick View" }, { value: "asli", label: "Original View" }]} value={source} onChange={onSourceChange} />
      )}

      {columns && onColumnsChange && (
        <Menu position="bottom-end" width={196} offset={6} withinPortal>
          <Menu.Target>
            <button type="button" className={classes.columnsButton} aria-label={`Jumlah kolom: ${columns}. Ganti`} title="Jumlah kolom">
              <IconLayoutColumns size={16} aria-hidden /><b>{columns}</b>
            </button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>Jumlah kolom</Menu.Label>
            {[1, 2, 3, 4].map((n) => (
              <Menu.Item key={n} onClick={() => onColumnsChange(n)} rightSection={n === columns ? <IconCheck size={14} /> : null}
                leftSection={<span className={classes.columnsPreview} aria-hidden>{Array.from({ length: n }, (_, i) => <i key={i} />)}</span>}>
                {n} kolom{n <= 2 ? " + filter" : ""}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      )}
      {children}
    </section>
  );
}
