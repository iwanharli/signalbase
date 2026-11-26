"use client";
// Beranda: a pill beside "Beranda · <project>" that opens, in a right-hand drawer, the project's registered keywords with
// how many posts and articles mention each in the chosen period. Read only: keywords are set by an admin.
import { Fragment, useState } from "react";
import { Drawer, Skeleton } from "@mantine/core";
import { IconChevronRight, IconTag, IconX } from "@tabler/icons-react";
import { formatNumber } from "@/lib/media/labels";
import type { ViewData } from "./Insights";
import c from "./keywordsPill.module.css";

/** A keyword as written ("(polres or polsek) and \"urus skck\""): AND/OR as small badges, quoted phrases highlighted. */
function KeywordText({ value }: { value: string }) {
  const parts = value.match(/"[^"]*"|\(|\)|\band\b|\bor\b|[^\s()"]+/gi) ?? [value];
  if (parts.length === 1) return <span className={c.word}>{value}</span>;
  return (
    <span className={c.expr}>
      {parts.map((p, i) => {
        const lower = p.toLowerCase();
        if (lower === "and" || lower === "or") return <i key={i} className={c.op} data-op={lower}>{lower === "and" ? "DAN" : "ATAU"}</i>;
        if (p === "(" || p === ")") return <span key={i} className={c.paren}>{p}</span>;
        if (p.startsWith('"')) return <q key={i} className={c.phrase}>{p.slice(1, -1)}</q>;
        return <Fragment key={i}><span className={c.word}>{p}</span></Fragment>;
      })}
    </span>
  );
}

export function KeywordsPill({ name, keywords, data, period, scope }: {
  name: string; keywords: string[]; data: ViewData | null; period: number; scope: string;
}) {
  const [open, setOpen] = useState(false);
  if (!keywords.length) return null;
  // Counts per keyword; with a single keyword the insights skip the breakdown, so it gets the period's whole volume.
  const counts = new Map((data?.keywords ?? []).map((r) => [r.value, r]));
  const rows = keywords.map((k) => {
    const r = counts.get(k) ?? (keywords.length === 1 && data ? { n: data.current.total, neg: data.current.neg } : null);
    return { keyword: k, n: data ? r?.n ?? 0 : null, neg: r?.neg != null && r.n ? Math.round((r.neg / r.n) * 100) : null };
  }).sort((a, b) => (b.n ?? -1) - (a.n ?? -1));
  const max = Math.max(1, ...rows.map((r) => r.n ?? 0));
  const active = rows.filter((r) => (r.n ?? 0) > 0).length;

  return (
    <>
      <button type="button" className={c.pill} onClick={() => setOpen(true)}>
        <IconTag size={13} aria-hidden />Keyword terdaftar<b>{keywords.length}</b><IconChevronRight size={13} aria-hidden />
      </button>
      <Drawer opened={open} onClose={() => setOpen(false)} position="right" size={480} withCloseButton={false} padding={0}
        overlayProps={{ backgroundOpacity: 0.45, blur: 3 }} classNames={{ content: c.drawer, body: c.drawerBody }}>
        <header className={c.head}>
          <span className={c.headIcon}><IconTag size={18} /></span>
          <div>
            <h2>Keyword terdaftar</h2>
            <p>{name}</p>
          </div>
          <button type="button" className={c.close} onClick={() => setOpen(false)} aria-label="Tutup"><IconX size={16} /></button>
        </header>

        <div className={c.stats}>
          <div><b>{keywords.length}</b><small>keyword</small></div>
          <div><b>{data ? active : "–"}</b><small>disebut periode ini</small></div>
          <div><b>{data ? formatNumber(data.current.total) : "–"}</b><small>total item</small></div>
        </div>
        <p className={c.scope}>{scope}</p>

        <ol className={c.list}>
          {rows.map((r, i) => (
            <li key={r.keyword} data-zero={r.n === 0 || undefined}>
              <span className={c.rank}>{i + 1}</span>
              <div className={c.body}>
                <div className={c.row}>
                  <KeywordText value={r.keyword} />
                  {r.n == null ? <Skeleton h={16} w={56} radius="sm" /> : <b className={c.count}>{formatNumber(r.n)}<small>post</small></b>}
                </div>
                <span className={c.bar}><i style={{ width: `${((r.n ?? 0) / max) * 100}%` }} /></span>
                {r.neg != null && <small className={c.neg} data-high={r.neg >= 50 || undefined}>{r.neg}% negatif</small>}
              </div>
            </li>
          ))}
        </ol>

        <footer className={c.foot}>
          Angka untuk {period} hari terakhir pada media yang dipilih di Beranda. Satu post bisa menyebut lebih dari satu keyword.
          Keyword diatur oleh admin Signalbase.
        </footer>
      </Drawer>
    </>
  );
}
