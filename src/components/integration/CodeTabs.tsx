"use client";
// Language tabs with a copy button for the Integrasi page's quick example.
import { useState } from "react";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import c from "./integration.module.css";

export function CodeTabs({ samples }: { samples: { id: string; label: string; code: string }[] }) {
  const [active, setActive] = useState(samples[0].id);
  const [copied, setCopied] = useState(false);
  const current = samples.find((s) => s.id === active) ?? samples[0];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(current.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard blocked: nothing to do */ }
  };

  return (
    <div className={c.codeCard}>
      <div className={c.codeBar}>
        <div className={c.tabs} role="tablist" aria-label="Bahasa contoh kode">
          {samples.map((s) => (
            <button key={s.id} type="button" role="tab" aria-selected={active === s.id} data-active={active === s.id || undefined} onClick={() => setActive(s.id)}>{s.label}</button>
          ))}
        </div>
        <button type="button" className={c.copy} onClick={copy} aria-label="Salin kode">
          {copied ? <><IconCheck size={14} />Tersalin</> : <><IconCopy size={14} />Salin</>}
        </button>
      </div>
      <pre className={c.code}><code>{current.code}</code></pre>
    </div>
  );
}
