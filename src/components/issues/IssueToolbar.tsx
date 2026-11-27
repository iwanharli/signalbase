"use client";
// The toolbar of both issue pages, the same on each: period, sort, search and the count shown on the first row; the
// page's filter chips (levels, status, "Baru") with their counts and a reset on the second.
import type { RefObject } from "react";
import { IconAdjustmentsHorizontal, IconArrowsSort, IconCalendar, IconRotate, IconSearch, IconX } from "@tabler/icons-react";
import { formatNumber } from "@/lib/media/labels";
import { Segmented } from "../ui/controls";
import base from "./onlineIssues.module.css";
import c from "./issueToolbar.module.css";

export type IssueSort = "skor" | "terbaru" | "volume";
export const SORT_OPTIONS: { value: IssueSort; label: string }[] = [{ value: "skor", label: "Skor" }, { value: "terbaru", label: "Terbaru" }, { value: "volume", label: "Volume" }];

/** One filter chip: on = its issues are shown. `color` tints it (a CSS colour). */
export type IssueChip = { key: string; label: string; count: number | null; on: boolean; color: string; title?: string; onToggle: () => void };

export function IssueToolbar({ periods, days, onDays, sort, onSort, chips, extra, search, onSearch, searchRef, placeholder, shown, total, onReset }: {
  periods: { value: string; label: string }[]; days: string; onDays: (v: string) => void;
  sort: IssueSort; onSort: (v: IssueSort) => void;
  chips: IssueChip[];
  /** Filters set elsewhere on the page (e.g. an actor picked in an issue), shown as removable chips. */
  extra?: React.ReactNode;
  search: string; onSearch: (v: string) => void; searchRef: RefObject<HTMLInputElement | null>; placeholder: string;
  shown: number | null; total: number | null;
  /** Shown when any filter or the search narrows the list. */
  onReset: (() => void) | null;
}) {
  return (
    <div className={`${base.toolbar} ${c.toolbar}`}>
      <div className={c.row}>
        <span className={c.group}><IconCalendar size={14} aria-hidden /><Segmented label="Periode" options={periods} value={days} onChange={onDays} /></span>
        <span className={c.group}><IconArrowsSort size={14} aria-hidden /><Segmented label="Urutkan" options={SORT_OPTIONS} value={sort} onChange={(v) => onSort(v as IssueSort)} /></span>
        <label className={base.search}>
          <IconSearch size={15} />
          <input ref={searchRef} value={search} onChange={(e) => onSearch(e.currentTarget.value)} placeholder={`${placeholder}  ( / )`} />
          {search && <button type="button" onClick={() => onSearch("")} aria-label="Hapus pencarian"><IconX size={14} /></button>}
        </label>
      </div>
      <div className={c.row}>
        <div className={c.chips} role="group" aria-label="Filter isu">
          <span className={c.chipsLabel}><IconAdjustmentsHorizontal size={14} />Filter</span>
          {chips.map((ch) => (
            <button key={ch.key} type="button" style={{ "--c": ch.color } as React.CSSProperties} data-active={ch.on || undefined} aria-pressed={ch.on}
              title={ch.title ?? (ch.on ? `Sembunyikan ${ch.label}` : `Tampilkan ${ch.label}`)} onClick={ch.onToggle}>
              <i />{ch.label}<b>{ch.count === null ? "–" : formatNumber(ch.count)}</b>
            </button>
          ))}
        </div>
        {extra}
        {onReset && <button type="button" className={c.reset} onClick={onReset}><IconRotate size={14} />Reset filter</button>}
        <span className={c.count} aria-live="polite">
          {total === null ? "Memuat…" : shown === total ? <><b>{formatNumber(total)}</b> isu</> : <><b>{formatNumber(shown ?? 0)}</b> dari {formatNumber(total)} isu</>}
        </span>
      </div>
    </div>
  );
}
