"use client";
import { useState } from "react";
import { IconArrowUpRight, IconLayersIntersect } from "@tabler/icons-react";
import { USE_CASES } from "./content";
import c from "./landing.module.css";

/** Tabs on the left, the selected use case on the right. */
export function UseCases() {
  const [active, setActive] = useState(0);
  const current = USE_CASES[active];
  return (
    <div className={c.caseLayout}>
      <div className={c.caseTabs} role="tablist" aria-label="Contoh penggunaan">
        {USE_CASES.map((u, i) => (
          <button key={u.tab} type="button" role="tab" id={`case-${i}`} aria-selected={active === i} aria-controls="use-case-panel" onClick={() => setActive(i)}>
            <span>0{i + 1}</span>{u.tab}<IconArrowUpRight size={18} />
          </button>
        ))}
      </div>
      <div id="use-case-panel" role="tabpanel" aria-labelledby={`case-${active}`} className={c.casePanel}>
        <IconLayersIntersect size={38} />
        <h3>{current.title}</h3>
        <p>{current.text}</p>
        <div>{current.tags.map((t) => <span key={t}>{t}</span>)}</div>
      </div>
    </div>
  );
}
