"use client";
// Text read from an image, shown for reading: headline lines bold, broken sentences joined (reflowOcr), the searched
// term highlighted, a copy button; the raw OCR text folds out below as plain data.
import { Fragment, useState } from "react";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import { formatNumber } from "@/lib/media/labels";
import { reflowOcr } from "@/lib/mediaVisual";
import c from "./mediaVisual.module.css";

export function Marked({ text, term }: { text: string; term: string }) {
  const t = term.trim();
  if (t.length < 2) return <>{text}</>;
  const parts = text.split(new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return <>{parts.map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : <Fragment key={i}>{p}</Fragment>))}</>;
}

export function OcrText({ keyText, ocrText, ocrWords, highlight = "", emptyNote }: { keyText: string; ocrText: string; ocrWords: number; highlight?: string; emptyNote: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => navigator.clipboard?.writeText(keyText).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  return (
    <div className={c.ocrBox}>
      {keyText ? (
        <>
          <button type="button" className={c.copy} onClick={copy} title="Salin teks">{copied ? <IconCheck size={13} /> : <IconCopy size={13} />}{copied ? "Disalin" : "Salin"}</button>
          <div className={c.reflow}>
            {reflowOcr(keyText).map((b, i) => (b.kind === "headline"
              ? <p key={i} className={c.headline}><Marked text={b.text} term={highlight} /></p>
              : <p key={i}><Marked text={b.text} term={highlight} /></p>))}
          </div>
        </>
      ) : <p className={c.ocrEmpty}>{emptyNote}</p>}
      {ocrText && ocrText !== keyText && (
        <details className={c.rawText}>
          <summary>Semua teks yang terbaca · {formatNumber(ocrWords)} kata</summary>
          <pre className={c.raw}><Marked text={ocrText} term={highlight} /></pre>
        </details>
      )}
    </div>
  );
}
