"use client";
// Beranda (a project): what the project's AI categorisation and AI labelling have found, per media type, compact. Shown
// only for the features an admin has switched on. Each row opens the matching posts or articles.
import { useState } from "react";
import Link from "next/link";
import { Skeleton } from "@mantine/core";
import { IconCheck, IconClock, IconRobot, IconTags } from "@tabler/icons-react";
import { NO_CATEGORY } from "@/lib/ai/classifier";
import { formatNumber, MEDIA_TYPE_LABEL } from "@/lib/media/labels";
import { labelColor } from "@/lib/media/manualLabels";
import type { MediaType } from "@/lib/media/types";
import { useApi } from "@/lib/useApi";
import c from "./aiOverview.module.css";

type Part<R> = { types: { type: MediaType; done: boolean; total: number; rows: R[] }[] } | null;
type Overview = { categorisation: Part<{ code: string; label: string; n: number }>; labelling: Part<{ label: string | null; n: number }> };

export function AiOverview({ keyId }: { keyId: string }) {
  const { data } = useApi<Overview>(`/api/admin/keys/${encodeURIComponent(keyId)}/ai-overview`);
  if (data && !data.categorisation && !data.labelling) return null;
  const both = !!data?.categorisation && !!data?.labelling;
  return (
    <div className={c.wrap} data-cols={both ? 2 : 1}>
      {!data ? <><Skeleton h={260} radius="lg" /><Skeleton h={260} radius="lg" /></> : <>
        {data.categorisation && (
          <Card icon={IconRobot} title="Kategorisasi AI" note="Kategori tiap post dan berita menurut AI proyek ini." part={data.categorisation}
            row={(r, type, total) => ({
              key: r.code, label: r.label, n: r.n, share: total ? r.n / total : 0, none: r.code === NO_CATEGORY,
              mark: r.code === NO_CATEGORY ? "—" : r.code, href: `/media/${type}?key=${encodeURIComponent(keyId)}&aiCategory=${encodeURIComponent(r.code)}&analyzed=&relevance=&from=`,
            })} />
        )}
        {data.labelling && (
          <Card icon={IconTags} title="Label AI" note="Label yang diberikan AI. Satu post bisa punya beberapa label." part={data.labelling}
            row={(r, type, total) => {
              const options = data.labelling!.types[0]?.rows.filter((x) => x.label).map((x) => x.label!) ?? [];
              return {
                key: r.label ?? "none", label: r.label ?? "Tidak ada label cocok", n: r.n, share: total ? r.n / total : 0, none: !r.label,
                color: r.label ? `var(--mantine-color-${labelColor(options, r.label)}-6)` : undefined,
                href: r.label ? `/media/${type}?key=${encodeURIComponent(keyId)}&label=${encodeURIComponent(r.label)}&analyzed=&relevance=&from=` : null,
              };
            }} />
        )}
      </>}
    </div>
  );
}

type Row = { key: string; label: string; n: number; share: number; none: boolean; mark?: string; color?: string; href: string | null };

function Card<R>({ icon: Icon, title, note, part, row }: {
  icon: typeof IconRobot; title: string; note: string; part: NonNullable<Part<R>>; row: (r: R, type: MediaType, total: number) => Row;
}) {
  const [type, setType] = useState<MediaType>(part.types[0]?.type ?? "social");
  const t = part.types.find((x) => x.type === type) ?? part.types[0];
  if (!t) return null;
  const rows = t.rows.map((r) => row(r, t.type, t.total));
  const max = Math.max(1, ...rows.filter((r) => !r.none).map((r) => r.n));
  return (
    <section className={c.card}>
      <header className={c.head}>
        <span className={c.icon}><Icon size={17} /></span>
        <div className={c.title}><h3>{title}</h3><p>{note}</p></div>
        {part.types.length > 1 && (
          <div className={c.tabs} role="tablist" aria-label="Jenis media">
            {part.types.map((x) => (
              <button key={x.type} type="button" role="tab" aria-selected={x.type === t.type} data-active={x.type === t.type || undefined} onClick={() => setType(x.type)}>
                {MEDIA_TYPE_LABEL[x.type]}
              </button>
            ))}
          </div>
        )}
      </header>
      <div className={c.status}>
        <span data-done={t.done || undefined}>{t.done ? <><IconCheck size={12} />Selesai · mengikuti data baru</> : <><IconClock size={12} />Sedang berjalan</>}</span>
        <b>{formatNumber(t.total)}<small> {t.type === "online" ? "berita" : "post"} diproses</small></b>
      </div>
      <ul className={c.rows}>
        {rows.map((r) => {
          const body = (
            <>
              {r.mark ? <span className={c.code} data-none={r.none || undefined}>{r.mark}</span>
                : <i className={c.dot} data-none={r.none || undefined} style={r.color ? { background: r.color } : undefined} />}
              <span className={c.label}>{r.label}</span>
              <span className={c.bar}><i data-none={r.none || undefined} style={{ width: `${r.none ? r.share * 100 : (r.n / max) * 100}%`, ...(r.color ? { background: r.color } : {}) }} /></span>
              <b className={c.n}>{formatNumber(r.n)}</b>
              <small className={c.pct}>{Math.round(r.share * 100)}%</small>
            </>
          );
          return <li key={r.key}>{r.href ? <Link href={r.href} className={c.row}>{body}</Link> : <div className={c.row}>{body}</div>}</li>;
        })}
      </ul>
    </section>
  );
}
