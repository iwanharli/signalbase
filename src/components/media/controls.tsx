"use client";
// Form controls styled for the dark filter surfaces.
import { MultiSelect, Select, type MultiSelectProps, type SelectProps } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import dayjs from "dayjs";
import "dayjs/locale/id";
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

const toDate = (value: string) => (value ? dayjs(value).toDate() : null);
const toValue = (date: Date | null) => (date ? dayjs(date).format("YYYY-MM-DD") : "");

function DateField({ label, value, min, max, onChange }: { label: string; value: string; min?: string; max?: string; onChange: (value: string) => void }) {
  return (
    <div className={classes.date}>
      <small>{label}</small>
      <DatePickerInput value={toDate(value)} onChange={(d) => onChange(toValue(d))} minDate={toDate(min ?? "") ?? undefined} maxDate={toDate(max ?? "") ?? undefined}
        locale="id" valueFormat="D MMM YYYY" placeholder="Pilih tanggal" clearable variant="unstyled" size="xs" firstDayOfWeek={1}
        classNames={{ input: classes.dateInput, day: classes.dateDay, calendarHeaderControl: classes.dateControl, calendarHeaderLevel: classes.dateControl, weekday: classes.dateWeekday, monthsListControl: classes.dateDay, yearsListControl: classes.dateDay }}
        popoverProps={{ withinPortal: true, zIndex: 400, classNames: { dropdown: classes.dateDropdown }, transitionProps: { transition: "pop", duration: 160 } }} />
    </div>
  );
}

export function DateRange({ from, to, onChange }: { from: string; to: string; onChange: (range: { from: string; to: string }) => void }) {
  return (
    <div className={classes.dateRange}>
      <DateField label="Dari" value={from} max={to || undefined} onChange={(v) => onChange({ from: v, to })} />
      <DateField label="Sampai" value={to} min={from || undefined} onChange={(v) => onChange({ from, to: v })} />
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
