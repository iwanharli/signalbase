"use client";
// Original View card: switch between the post as its platform shows it and the data Signalbase stored.
import { IconDatabase } from "@tabler/icons-react";
import { PlatformMark } from "./PlatformIcon";
import classes from "./originalCard.module.css";

export type SourceView = "original" | "stored";

export function SourceSwitch({ value, onChange, source }: { value: SourceView; onChange: (v: SourceView) => void; source?: string | null }) {
  const options = [
    { value: "original" as const, label: "Asli", title: "Post asli seperti tampil di platformnya", icon: <PlatformMark source={source} size={12} /> },
    { value: "stored" as const, label: "Tersimpan", title: "Data tersimpan di Signalbase", icon: <IconDatabase size={12} aria-hidden /> },
  ];
  return (
    <div className={classes.switch} role="tablist" aria-label="Sumber konten post" onClick={(e) => e.stopPropagation()}>
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} data-active={value === o.value || undefined} title={o.title} onClick={() => onChange(o.value)}>
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}
