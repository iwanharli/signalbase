"use client";
// Where an admin checks the AI's work: shortcuts into the key's media view (where items can be corrected),
// and the items the provider refused, with a retry.
import { useState } from "react";
import { Modal } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconArrowRight, IconChecklist, IconRefresh } from "@tabler/icons-react";
import dayjs from "dayjs";
import "dayjs/locale/id";
import { post } from "@/lib/api-client";
import { formatNumber } from "@/lib/media/labels";
import { useApi } from "@/lib/useApi";
import { Button } from "../ui/Button";
import classes from "./review.module.css";

type Rejected = { total: number; items: { type: "social" | "online"; code: string; source: string; publishedAt: string; text: string }[] };

export function ReviewPanel({ keyId, types, low, none, onRetried }: {
  keyId: string; types: ("social" | "online")[]; low: number; none: number; onRetried: () => void;
}) {
  const rejected = useApi<Rejected>(`/api/admin/keys/${keyId}/classifier/rejected`);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const type = types[0] ?? "social";
  const view = (aiCategory: string) => `/media/${type}?key=${keyId}&aiCategory=${encodeURIComponent(aiCategory)}`;

  const retry = async () => {
    setBusy(true);
    try {
      const r = await post(`/api/admin/keys/${keyId}/classifier/rejected`, {}) as { labelled: number; remaining: number };
      notifications.show({ color: r.remaining ? "orange" : "teal", message: `${formatNumber(r.labelled)} berhasil dikategorikan${r.remaining ? `, ${formatNumber(r.remaining)} masih ditolak` : ""}` });
      rejected.reload();
      onRetried();
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const failed = rejected.data?.total ?? 0;
  return (
    <section className={classes.card}>
      <header className={classes.head}>
        <span className={classes.icon}><IconChecklist size={16} /></span>
        <div><b>Tinjau hasil</b><small>Buka daftarnya, lalu koreksi kategori dari detail item bila perlu.</small></div>
      </header>
      <div className={classes.links}>
        <a href={view("~low")}><span>Keyakinan rendah</span><b>{formatNumber(low)}</b><IconArrowRight size={14} /></a>
        <a href={view("none")}><span>Tidak termasuk</span><b>{formatNumber(none)}</b><IconArrowRight size={14} /></a>
        <a href={view("*")}><span>Semua hasil</span><IconArrowRight size={14} /></a>
        <button type="button" onClick={() => setOpen(true)} data-warn={failed > 0 || undefined}>
          <span>Terlewat (ditolak penyedia)</span><b>{rejected.data ? formatNumber(failed) : "…"}</b><IconArrowRight size={14} />
        </button>
      </div>

      <Modal opened={open} onClose={() => setOpen(false)} centered size="lg" radius={18} title="Item yang ditolak penyedia AI">
        <p className={classes.note}>
          Penyedia AI menolak item ini (misalnya error server atau filter konten). Worker mencobanya lagi otomatis setiap 6 jam; tombol di bawah mencobanya sekarang.
        </p>
        {!rejected.data ? <p className={classes.note}>Memuat…</p> : !rejected.data.items.length ? (
          <p className={classes.empty}>Tidak ada item yang terlewat.</p>
        ) : (
          <ol className={classes.list}>
            {rejected.data.items.map((i) => (
              <li key={`${i.type}:${i.code}`}>
                <small>{i.type === "social" ? "Media sosial" : "Media online"} · {i.source} · {dayjs(i.publishedAt).locale("id").format("D MMM, HH:mm")}</small>
                <p>{i.text || "(tanpa teks)"}</p>
              </li>
            ))}
          </ol>
        )}
        <div className={classes.actions}>
          {failed > 0 && <span className={classes.warn}><IconAlertTriangle size={14} />Mencoba lagi memakai kredit AI.</span>}
          <Button variant="secondary" onClick={() => setOpen(false)}>Tutup</Button>
          <Button variant="primary" icon={IconRefresh} onClick={retry} loading={busy} disabled={!failed}>{busy ? "Mencoba…" : `Coba lagi ${failed ? formatNumber(failed) : ""}`}</Button>
        </div>
      </Modal>
    </section>
  );
}
