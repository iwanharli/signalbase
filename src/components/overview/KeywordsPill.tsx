"use client";
// Beranda: a pill beside "Beranda · <project>" that opens the project's registered keywords with how many posts and
// articles mention each in the chosen period. Read only: keywords are set by an admin on the project page.
import { useState } from "react";
import { Modal } from "@mantine/core";
import { IconChevronRight, IconTag } from "@tabler/icons-react";
import { formatNumber } from "@/lib/media/labels";
import type { ViewData } from "./Insights";
import c from "./keywordsPill.module.css";

export function KeywordsPill({ name, keywords, data, period, scope }: {
  name: string; keywords: string[]; data: ViewData | null; period: number; scope: string;
}) {
  const [open, setOpen] = useState(false);
  if (!keywords.length) return null;
  // Counts per keyword; with a single keyword the insights skip the breakdown, so it gets the period's whole volume.
  const counts = new Map((data?.keywords ?? []).map((r) => [r.value, r]));
  const rows = keywords.map((k) => {
    const r = counts.get(k) ?? (keywords.length === 1 && data ? { n: data.current.total, prev: data.previous.total, neg: data.current.neg } : null);
    return { keyword: k, n: r?.n ?? null, neg: r && "neg" in r && r.neg != null && r.n ? Math.round((r.neg / r.n) * 100) : null };
  }).sort((a, b) => (b.n ?? -1) - (a.n ?? -1));
  const max = Math.max(1, ...rows.map((r) => r.n ?? 0));
  const total = data ? data.current.total : null;

  return (
    <>
      <button type="button" className={c.pill} onClick={() => setOpen(true)}>
        <IconTag size={13} aria-hidden />Keyword terdaftar<b>{keywords.length}</b><IconChevronRight size={13} aria-hidden />
      </button>
      <Modal opened={open} onClose={() => setOpen(false)} centered size="lg" radius="lg" title={<span className={c.title}><IconTag size={17} />Keyword terdaftar · {name}</span>}
        classNames={{ content: c.modal, header: c.modalHeader, body: c.modalBody }}>
        <p className={c.note}>
          {keywords.length} keyword · {scope}{total != null && <> · total {formatNumber(total)} item</>}. Satu post bisa menyebut lebih dari satu keyword.
          Keyword diatur oleh admin Signalbase.
        </p>
        <ol className={c.list}>
          {rows.map((r, i) => (
            <li key={r.keyword}>
              <span className={c.rank}>{i + 1}</span>
              <div className={c.body}>
                <div className={c.row}>
                  <code title={r.keyword}>{r.keyword}</code>
                  <b>{r.n == null ? (data ? "—" : "…") : formatNumber(r.n)}<small> post</small></b>
                </div>
                <span className={c.bar}><i style={{ width: `${((r.n ?? 0) / max) * 100}%` }} /></span>
                {r.neg != null && <small className={c.neg} data-high={r.neg >= 50 || undefined}>{r.neg}% negatif</small>}
              </div>
            </li>
          ))}
        </ol>
        {!data && <p className={c.note}>Memuat jumlah post…</p>}
        <p className={c.foot}>Angka untuk {period} hari terakhir pada media yang sedang dipilih di Beranda.</p>
      </Modal>
    </>
  );
}
