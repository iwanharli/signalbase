"use client";
// Pieces shared by the preview views.
import { useEffect, useState } from "react";
import { IconArrowRight } from "@tabler/icons-react";
import { DAY_LABELS, type MoodShare } from "./data";
import c from "./preview.module.css";

const COUNT_UP_MS = 1000;

/** Counts up from 0 once when shown, like the real panel's tiles. */
export function CountUp({ value }: { value: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / COUNT_UP_MS);
      setN(value * (1 - Math.pow(1 - progress, 4)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{Math.round(n).toLocaleString("id-ID")}</>;
}

/** Card header with a title, a subtitle and an optional action on the right. */
export function PanelHead({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return (
    <header className={c.panelHead}>
      <div><h4>{title}</h4><p>{text}</p></div>
      {action}
    </header>
  );
}

/** One media type on the home view: 14 daily bars plus the 7-day mood split, as the real dashboard. */
export function TypePanel({ title, days, moods, kind, tone }: { title: string; days: number[]; moods: MoodShare[]; kind: string; tone: "violet" | "cyan" }) {
  const peak = Math.max(...days);
  return (
    <section className={c.panel} data-tone={tone}>
      <PanelHead title={title} text="Volume harian, 14 hari terakhir" action={<span className={c.more}>Jelajahi <IconArrowRight size={12} /></span>} />
      <div className={c.chart}>
        {days.map((n, i) => (
          <div key={i} className={c.col} data-today={i === days.length - 1 || undefined}>
            <i style={{ height: `${(n / peak) * 100}%`, animationDelay: `${i * 35}ms` }} />
            <small>{DAY_LABELS[i]}</small>
          </div>
        ))}
      </div>
      <div className={c.moodHead}>{kind} · 7 hari</div>
      <div className={c.spectrum}>{moods.map(([label, pct, color]) => <i key={label} style={{ flexGrow: pct, background: color }} />)}</div>
      <div className={c.legend}>{moods.map(([label, pct, color]) => <span key={label}><i style={{ background: color }} />{label}<b>{pct}%</b></span>)}</div>
    </section>
  );
}
