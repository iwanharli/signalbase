"use client";
// Form controls styled for the dark filter surfaces.
import { MultiSelect, Select, type MultiSelectProps, type SelectProps } from "@mantine/core";
import classes from "./controls.module.css";

export type Option<T extends string> = { value: T; label: string };

export function Segmented<T extends string>({ value, options, onChange, full, disabled, label, className }: {
  value: T;
  options: readonly Option<T>[];
  onChange: (value: T) => void;
  /** Stretch to the container width and wrap when needed (used in the drawer). */
  full?: boolean;
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <div className={[classes.segmented, className].filter(Boolean).join(" ")} data-full={full || undefined} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" disabled={disabled} data-active={value === o.value || undefined} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Labelled control. `wide` spans both columns of a two-column grid. */
export function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={classes.field} data-wide={wide || undefined}>
      <span className={classes.fieldLabel}>{label}</span>
      {children}
    </div>
  );
}

/** Searchable, clearable Mantine Select with the dark theme. */
export function DarkSelect(props: SelectProps) {
  return (
    <Select
      clearable
      searchable
      classNames={{ input: classes.selectInput, section: classes.selectSection, dropdown: classes.selectDropdown, option: classes.selectOption }}
      comboboxProps={{ withinPortal: true, zIndex: 400, transitionProps: { transition: "pop", duration: 160 } }}
      {...props}
    />
  );
}

export function DateRange({ from, to, onChange }: { from: string; to: string; onChange: (range: { from: string; to: string }) => void }) {
  return (
    <div className={classes.dateRange}>
      <label className={classes.date}>
        <small>Dari</small>
        <input type="date" value={from} max={to || undefined} onChange={(e) => onChange({ from: e.currentTarget.value, to })} />
      </label>
      <label className={classes.date}>
        <small>Sampai</small>
        <input type="date" value={to} min={from || undefined} onChange={(e) => onChange({ from, to: e.currentTarget.value })} />
      </label>
    </div>
  );
}

/** Searchable multi-select with the dark theme. */
export function DarkMultiSelect(props: MultiSelectProps) {
  return (
    <MultiSelect
      searchable
      clearable
      hidePickedOptions
      classNames={{ input: classes.selectInput, section: classes.selectSection, dropdown: classes.selectDropdown, option: classes.selectOption, pill: classes.selectPill, inputField: classes.selectField }}
      comboboxProps={{ withinPortal: true, zIndex: 400, transitionProps: { transition: "pop", duration: 160 } }}
      {...props}
    />
  );
}
