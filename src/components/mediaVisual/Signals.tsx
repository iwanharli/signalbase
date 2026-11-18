"use client";
// What an image's text says, on the Media visual page: a call to action (rally date, time, place), numeric claims to
// check, and shared narratives (the same message on several posts' images).
import { IconCalendarEvent, IconChartBar, IconClock, IconLanguage, IconMapPin, IconMessages, IconSpeakerphone } from "@tabler/icons-react";
import dayjs from "dayjs";
import "dayjs/locale/id";
import relativeTime from "dayjs/plugin/relativeTime";
import { formatNumber } from "@/lib/media/labels";
import type { ActionCall, VisualNarrative } from "@/lib/mediaVisual";
import m from "../media/modal.module.css";
import c from "./mediaVisual.module.css";

dayjs.extend(relativeTime);

/** Badges on a card's image. */
export function SignalBadges({ action, claims, unread }: { action: ActionCall | null; claims: number; unread?: boolean }) {
  return (
    <>
      {action && <span className={c.actionBadge} title="Teks gambar berisi ajakan aksi dengan tanggal, jam, atau tempat"><IconSpeakerphone size={11} />Ajakan aksi</span>}
      {claims > 0 && <span className={c.kind} title="Teks gambar memuat klaim angka"><IconChartBar size={11} />Klaim angka</span>}
      {unread && <span className={c.kind} title="Ada teks beraksara lain (mis. Arab, Kirill, Mandarin) yang belum bisa dibaca"><IconLanguage size={11} />Aksara lain</span>}
    </>
  );
}

/** Modal sections: the call to action, the claims, and a link to the posts sharing the same message. */
export function SignalSections({ action, claims, narratives, onNarrative }: { action: ActionCall | null; claims: string[]; narratives: string[]; onNarrative: (key: string) => void }) {
  return (
    <>
      {action && (
        <section className={`${m.contextSection} ${c.actionBox}`}>
          <h3><IconSpeakerphone size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Ajakan aksi terdeteksi</h3>
          <div className={c.actionFacts}>
            {action.date && <span><IconCalendarEvent size={13} />{action.date}</span>}
            {action.time && <span><IconClock size={13} />{action.time}</span>}
            {action.place && <span><IconMapPin size={13} />{action.place}</span>}
          </div>
          <p className={m.sectionNote}>Kata ajakan: {action.words.join(", ")}. Dideteksi otomatis dari teks gambar; pastikan dengan membaca gambarnya.</p>
        </section>
      )}
      {claims.length > 0 && (
        <section className={m.contextSection}>
          <h3><IconChartBar size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Klaim angka untuk dicek</h3>
          <ul className={c.claims}>{claims.map((l) => <li key={l}>{l}</li>)}</ul>
          <p className={m.sectionNote}>Hasil cek bisa dicatat sebagai label manual proyek (mis. hoax / tidak hoax) lewat detail post.</p>
        </section>
      )}
      {narratives.length > 0 && (
        <button type="button" className={c.narrativeLink} onClick={() => onNarrative(narratives[0])}>
          <IconMessages size={15} />Cari post lain dengan pesan gambar yang sama
        </button>
      )}
    </>
  );
}

/** One shared narrative in the "Narasi" view. */
export function NarrativeCard({ n, onOpen }: { n: VisualNarrative; onOpen: () => void }) {
  const hours = Math.max(1, Math.round((new Date(n.last).getTime() - new Date(n.first).getTime()) / 3_600_000));
  return (
    <button type="button" className={c.card} onClick={onOpen}>
      <span className={c.thumb} style={{ aspectRatio: "16 / 10" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- remote media from many hosts */}
        <img src={n.sample.url} alt="" loading="lazy" referrerPolicy="no-referrer" />
        <span className={c.badges}><span className={c.narrBadge}><IconMessages size={11} />{formatNumber(n.posts)} post</span></span>
      </span>
      <span className={c.body}>
        <span className={c.ocr}>{n.sample.keyText.replace(/\s+/g, " ")}</span>
        <span className={c.foot}>
          <span className={c.footSource}>{n.images > 1 ? `${formatNumber(n.images)} gambar berbeda` : "gambar yang sama"}</span>
          <span>dalam {hours < 48 ? `${hours} jam` : `${Math.round(hours / 24)} hari`} · {dayjs(n.last).locale("id").fromNow()}</span>
        </span>
      </span>
    </button>
  );
}
