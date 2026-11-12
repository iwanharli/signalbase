"use client";
// Side panel of the SNA graph: one account's summary, posts and mentions (tabs).
import { useEffect, useState } from "react";
import Link from "next/link";
import { Skeleton } from "@mantine/core";
import { IconExternalLink, IconUser, IconUsers, IconX } from "@tabler/icons-react";
import { formatNumber, sourceLabel } from "@/lib/media/labels";
import { dominantTone, nodeCounts, TONE_COLOR, TONE_LABEL, toneOf, type SnaAccount, type SnaGraph, type SnaNode, type SnaRole, type Tone } from "@/lib/sna";
import { useApi } from "@/lib/useApi";
import { fromNow } from "../apiKeys/shared";
import classes from "./sna.module.css";

const TONES: Tone[] = ["negative", "neutral", "positive", "unknown"];
const TABS = [{ id: "summary", label: "Ringkasan" }, { id: "posts", label: "Postingan" }, { id: "mentions", label: "Mention" }] as const;
type Tab = (typeof TABS)[number]["id"];

export function SnaPanel({ node, graph, days, keyId, onPick, onClose }: {
  node: SnaNode; graph: SnaGraph; days: number; keyId: string | null; onPick: (id: string) => void; onClose: () => void;
}) {
  const role: SnaRole = node.kind;
  const [tab, setTab] = useState<Tab>("summary");
  useEffect(() => setTab("summary"), [node.id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const account = useApi<SnaAccount>(`/api/admin/sna/account?username=${encodeURIComponent(node.id)}&role=${role}&days=${days}${keyId ? `&key=${encodeURIComponent(keyId)}` : ""}`);
  const counts = nodeCounts(graph.links, node.id, role);
  const total = TONES.reduce((n, t) => n + counts[t], 0) || 1;
  const related = graph.links.filter((l) => (role === "hub" ? l.source : l.target) === node.id).sort((a, b) => b.n - a.n);
  const buckets = account.data?.buckets ?? [];
  const peak = Math.max(1, ...buckets.map((b) => b.n));
  const mediaHref = `/media/social?q=${encodeURIComponent(node.id)}${keyId ? `&key=${encodeURIComponent(keyId)}` : ""}`;

  return (
    <aside className={classes.panel} aria-label={`Detail @${node.id}`}>
      <header>
        <span className={classes.panelIcon}>{role === "hub" ? <IconUsers size={18} /> : <IconUser size={18} />}</span>
        <div><b>@{node.id}</b><small>{role === "hub" ? `Akun top poster${node.source ? ` · ${sourceLabel(node.source)}` : ""}` : "Akun yang disebut"}</small></div>
        <button type="button" onClick={onClose} aria-label="Tutup panel"><IconX size={17} /></button>
      </header>
      <div className={classes.tabs} role="tablist">
        {TABS.map((t) => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} data-active={tab === t.id || undefined} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>

      <div className={classes.panelBody}>
        {tab === "summary" && (
          <>
            <div className={classes.kpis}>
              {role === "hub"
                ? <><div><b>{formatNumber(node.posts)}</b><span>post</span></div><div><b>{formatNumber(node.mentions)}</b><span>mention</span></div><div><b>{related.length}</b><span>akun disebut</span></div></>
                : <><div><b>{formatNumber(node.mentions)}</b><span>kali disebut</span></div><div><b>{related.length}</b><span>akun utama</span></div></>}
            </div>
            <h4>Emosi {role === "hub" ? "postingannya" : "post yang menyebutnya"}</h4>
            <div className={classes.mix} aria-hidden>{TONES.map((t) => counts[t] > 0 && <i key={t} style={{ width: `${(counts[t] / total) * 100}%`, background: TONE_COLOR[t] }} />)}</div>
            <ul className={classes.mixList}>
              {TONES.filter((t) => counts[t] > 0).map((t) => <li key={t}><i style={{ background: TONE_COLOR[t] }} />{TONE_LABEL[t]}<b>{formatNumber(counts[t])}</b></li>)}
            </ul>
            <h4>{days === 1 ? "Post per jam" : "Post per hari"}</h4>
            {account.loading && !account.data ? <Skeleton h={54} radius={8} /> : buckets.length === 0 ? <p className={classes.muted}>Tidak ada data.</p> : (
              <div className={classes.spark}>{buckets.map((b) => <i key={b.key} title={`${b.key}: ${b.n}`} style={{ height: `${Math.max(8, (b.n / peak) * 100)}%` }} />)}</div>
            )}
          </>
        )}

        {tab === "posts" && (
          <>
            {account.error && <p className={classes.muted}>{account.error}</p>}
            {account.loading && !account.data && Array.from({ length: 4 }, (_, i) => <Skeleton key={i} h={78} radius={12} />)}
            {account.data && account.data.posts.length === 0 && <p className={classes.muted}>Tidak ada postingan pada rentang ini.</p>}
            {account.data?.posts.map((p) => (
              <article key={p.code} className={classes.post}>
                <div><i style={{ background: TONE_COLOR[toneOf(p.emotion)] }} title={p.emotion ?? TONE_LABEL.unknown} />
                  <span>{role === "child" && p.username ? `@${p.username} · ` : ""}{sourceLabel(p.source)} · {fromNow(p.ts)}</span>
                  {p.url && <a href={p.url} target="_blank" rel="noopener noreferrer" aria-label="Buka post asli"><IconExternalLink size={14} /></a>}
                </div>
                <p>{p.content || "(tanpa teks)"}</p>
              </article>
            ))}
            <Link className={classes.more} href={mediaHref}>Buka di Media Sosial<IconExternalLink size={14} /></Link>
          </>
        )}

        {tab === "mentions" && (
          <>
            <h4>{role === "hub" ? "Akun yang dia sebut" : "Disebut oleh"}</h4>
            {related.length === 0 && <p className={classes.muted}>Tidak ada.</p>}
            <ul className={classes.rel}>
              {related.map((l) => {
                const other = role === "hub" ? l.target : l.source;
                return <li key={other}><button type="button" onClick={() => onPick(other)}><i style={{ background: TONE_COLOR[dominantTone(l.counts)] }} />@{other}<b>{l.n}×</b></button></li>;
              })}
            </ul>
          </>
        )}
      </div>
    </aside>
  );
}
