"use client";
// Floating card on the SNA issue view: what each flow (Langsung, Mention, Rantai waktu, Gelombang) shows, the current one
// highlighted; a row picks that flow. Folds into a small button; the choice is kept in this browser.
import { useEffect, useState } from "react";
import { IconAt, IconChevronDown, IconInfoCircle, IconTimeline, IconTopologyStar3, IconWaveSine } from "@tabler/icons-react";
import type { SnaFlow } from "@/lib/sna";
import classes from "./sna.module.css";

const FOLD_KEY = "sb.snaFlowGuideFolded";

// `short`: one line for every flow; `text`: how it is drawn, shown for the chosen one only.
const FLOWS: { value: SnaFlow; label: string; icon: typeof IconAt; short: string; text: string }[] = [
  { value: "langsung", label: "Langsung", icon: IconTopologyStar3, short: "Siapa saja yang membahas", text: "Semua akun terhubung langsung ke isu." },
  { value: "mention", label: "Mention", icon: IconAt, short: "Siapa memicu percakapan", text: "Akun menempel ke akun lebih awal yang ia sebut atau balas." },
  { value: "rantai", label: "Rantai waktu", icon: IconTimeline, short: "Urutan penyebaran", text: "Urut waktu post pertama: akun pertama ke isu, berikutnya ke akun sebelumnya." },
  { value: "gelombang", label: "Gelombang", icon: IconWaveSine, short: "Kapan isu meluas", text: "Per waktu sejak post pertama: jam pertama, 1–6 jam, 6–24 jam, 1–3 hari, > 3 hari." },
];

export function SnaFlowGuide({ flow, onPick }: { flow: SnaFlow; onPick: (flow: SnaFlow) => void }) {
  const [folded, setFolded] = useState(false);
  useEffect(() => { setFolded(localStorage.getItem(FOLD_KEY) === "1"); }, []);
  const fold = (v: boolean) => { setFolded(v); localStorage.setItem(FOLD_KEY, v ? "1" : "0"); };

  if (folded) {
    return (
      <button type="button" className={classes.flowGuidePill} onClick={() => fold(false)} aria-label="Tampilkan penjelasan alur">
        <IconInfoCircle size={15} aria-hidden />Alur: {FLOWS.find((f) => f.value === flow)?.label}
      </button>
    );
  }
  return (
    <aside className={classes.flowGuide} aria-label="Penjelasan alur">
      <header>
        <span><IconInfoCircle size={15} aria-hidden />Alur jaringan isu</span>
        <button type="button" onClick={() => fold(true)} aria-label="Sembunyikan penjelasan alur"><IconChevronDown size={15} /></button>
      </header>
      <ul>
        {FLOWS.map((f) => (
          <li key={f.value}>
            <button type="button" data-active={f.value === flow || undefined} aria-pressed={f.value === flow} onClick={() => onPick(f.value)}>
              <i><f.icon size={15} aria-hidden /></i>
              <span><b>{f.label}<small>{f.short}</small></b>{f.value === flow && <em>{f.text}</em>}</span>
            </button>
          </li>
        ))}
      </ul>
      {flow !== "langsung" && <p>Yang terhubung ke isu: akun yang paling awal memposting.</p>}
    </aside>
  );
}
