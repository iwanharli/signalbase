"use client";
// EWS: rallies announced in images (posters with an action word and a date, time or place, read by the media worker).
// Admins only while Media visual is on trial; the full list lives on Analisis → Media visual.
import Link from "next/link";
import { IconArrowRight, IconCalendarEvent, IconClock, IconMapPin, IconSpeakerphone } from "@tabler/icons-react";
import dayjs from "dayjs";
import "dayjs/locale/id";
import relativeTime from "dayjs/plugin/relativeTime";
import { sourceLabel } from "@/lib/media/labels";
import type { VisualResponse } from "@/lib/mediaVisual";
import { useApi } from "@/lib/useApi";
import { useRole } from "../shell/RoleContext";
import c from "./actionCalls.module.css";
import { VisualImage } from "../mediaVisual/VisualImage";

dayjs.extend(relativeTime);
const SHOWN = 4;
/** EWS periods (1, 3, 7, 14, 30 days) onto the media page's (1, 3, 7, 30). */
const visualDays = (days: number) => (days <= 1 ? 1 : days <= 3 ? 3 : days <= 7 ? 7 : 30);

export function ActionCalls({ days, keyId }: { days: number; keyId: string | null }) {
  const admin = useRole() === "admin";
  const qs = `view=post&action=1&days=${visualDays(days)}${keyId ? `&key=${encodeURIComponent(keyId)}` : ""}`;
  const res = useApi<VisualResponse>(admin ? `/api/admin/media-visual?${qs}` : null);
  const posts = res.data?.posts ?? [];
  if (!admin || !res.data) return null;
  return (
    <section className={c.panel} aria-label="Rencana aksi dari gambar">
      <header>
        <span className={c.icon}><IconSpeakerphone size={16} /></span>
        <div>
          <h3>Rencana aksi dari gambar</h3>
          <p>Poster atau gambar berisi ajakan aksi dengan tanggal, jam, atau tempat, dibaca otomatis dari media sosial dan berita.</p>
        </div>
        {posts.length > 0 && <Link href={`/analisis/media?${qs}`} className={c.all}>Lihat semua<IconArrowRight size={14} /></Link>}
      </header>
      {posts.length ? (
        <div className={c.list}>
          {posts.slice(0, SHOWN).map((p) => {
            const img = p.images.find((i) => i.actionCall) ?? p.images[0];
            const a = p.actionCall!;
            return (
              <Link key={p.key} href={`/analisis/media?${qs}`} className={c.item}>
                {img && <VisualImage src={img.url} loading="lazy" />}
                <span className={c.facts}>
                  {a.date && <span><IconCalendarEvent size={12} />{a.date}</span>}
                  {a.time && <span><IconClock size={12} />{a.time}</span>}
                  {a.place && <span><IconMapPin size={12} />{a.place}</span>}
                </span>
                <span className={c.text}>{p.keyText.replace(/\s+/g, " ").slice(0, 120)}</span>
                <small>{sourceLabel(p.source)} · {dayjs(p.publishedAt).locale("id").fromNow()}</small>
              </Link>
            );
          })}
        </div>
      ) : <p className={c.empty}>Belum ada ajakan aksi terdeteksi dari gambar dalam periode ini.</p>}
    </section>
  );
}
