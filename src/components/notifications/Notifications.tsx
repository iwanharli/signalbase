"use client";
// All notifications (what the top-bar bell shows for 24 hours), over a longer window, by kind and grouped per day.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Skeleton } from "@mantine/core";
import { IconAlertTriangle, IconArrowRight, IconBell, IconMessages, IconSpeakerphone } from "@tabler/icons-react";
import dayjs from "dayjs";
import "dayjs/locale/id";
import relativeTime from "dayjs/plugin/relativeTime";
import { ALERT_DAYS, alertHref, type VisualAlert } from "@/lib/mediaVisual";
import { useApi } from "@/lib/useApi";
import { Segmented } from "../ui/controls";
import c from "./notifications.module.css";

dayjs.extend(relativeTime);
const SEEN_KEY = "sb.mediaAlertsSeen"; // shared with the bell: opening this page counts as having seen them
type Kind = VisualAlert["kind"];
const KINDS: { kind: Kind; label: string; text: string; icon: typeof IconBell }[] = [
  { kind: "action", label: "Ajakan aksi", text: "Gambar atau video yang mengajak orang bertindak (demo, boikot, sebar).", icon: IconSpeakerphone },
  { kind: "narrative", label: "Narasi menyebar", text: "Pesan visual yang sama dipakai banyak post.", icon: IconMessages },
  { kind: "sensitive", label: "Perlu ditinjau", text: "Gambar dengan isi sensitif.", icon: IconAlertTriangle },
];
const PERIOD_LABEL: Record<number, string> = { 1: "24 jam", 3: "3 hari", 7: "7 hari", 30: "30 hari" };

const dayTitle = (d: dayjs.Dayjs) => {
  if (d.isSame(dayjs(), "day")) return "Hari ini";
  if (d.isSame(dayjs().subtract(1, "day"), "day")) return "Kemarin";
  return d.locale("id").format("dddd, D MMMM YYYY");
};

export function Notifications() {
  const [days, setDays] = useState<number>(7);
  const [kind, setKind] = useState<Kind | "all">("all");
  const { data, error, loading } = useApi<{ alerts: VisualAlert[]; keyId: string | null }>(`/api/admin/media-visual/alerts?days=${days}`);
  const [seenAt, setSeenAt] = useState<string | null>(null);
  useEffect(() => {
    try { setSeenAt(localStorage.getItem(SEEN_KEY)); } catch { /* storage unavailable */ }
  }, []);
  // Opening the page marks everything as seen for the bell (the "Baru" marks stay for this visit).
  useEffect(() => {
    const newest = data?.alerts[0]?.at;
    if (newest) try { if (!localStorage.getItem(SEEN_KEY) || newest > localStorage.getItem(SEEN_KEY)!) localStorage.setItem(SEEN_KEY, newest); } catch { /* ignore */ }
  }, [data]);

  const alerts = useMemo(() => data?.alerts ?? [], [data]);
  const counts = Object.fromEntries(KINDS.map((k) => [k.kind, alerts.filter((a) => a.kind === k.kind).length])) as Record<Kind, number>;
  const shown = kind === "all" ? alerts : alerts.filter((a) => a.kind === kind);
  const groups = useMemo(() => {
    const out: { title: string; items: VisualAlert[] }[] = [];
    for (const a of shown) {
      const title = dayTitle(dayjs(a.at));
      if (out.at(-1)?.title !== title) out.push({ title, items: [] });
      out.at(-1)!.items.push(a);
    }
    return out;
  }, [shown]);
  const fresh = seenAt ? alerts.filter((a) => a.at > seenAt).length : alerts.length;

  return (
    <div className={c.page}>
      <header className={c.hero}>
        <span className={c.heroIcon}><IconBell size={22} /></span>
        <div className={c.heroText}>
          <h1>Notifikasi</h1>
          <p>Temuan media visual yang perlu dilihat: ajakan aksi, narasi yang menyebar, dan gambar sensitif{data?.keyId === null ? " di seluruh bank" : " di proyek Anda"}.</p>
        </div>
        <Segmented label="Rentang waktu" options={ALERT_DAYS.map((d) => ({ value: String(d), label: PERIOD_LABEL[d] }))} value={String(days)} onChange={(v) => setDays(Number(v))} />
      </header>

      <div className={c.kinds} role="group" aria-label="Jenis notifikasi">
        <button type="button" data-active={kind === "all" || undefined} onClick={() => setKind("all")}>
          <span className={c.kindIcon} data-kind="all"><IconBell size={16} /></span>
          <span><b>Semua</b><small>{data ? `${alerts.length} notifikasi${fresh ? ` · ${fresh} baru` : ""}` : "…"}</small></span>
        </button>
        {KINDS.map((k) => (
          <button key={k.kind} type="button" data-active={kind === k.kind || undefined} onClick={() => setKind(k.kind)} title={k.text}>
            <span className={c.kindIcon} data-kind={k.kind}><k.icon size={16} /></span>
            <span><b>{k.label}</b><small>{data ? `${counts[k.kind]} temuan` : "…"}</small></span>
          </button>
        ))}
      </div>

      {error && <p className={c.empty}>Notifikasi tidak bisa dimuat: {error}</p>}
      {!data && !error && <div className={c.list}>{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} h={72} radius="md" />)}</div>}
      {data && !shown.length && (
        <div className={c.empty}>
          <IconBell size={28} />
          <b>Tidak ada notifikasi</b>
          <span>Belum ada {kind === "all" ? "ajakan aksi, narasi menyebar, atau gambar sensitif" : KINDS.find((k) => k.kind === kind)?.label.toLowerCase()} dalam {PERIOD_LABEL[days]} terakhir.</span>
        </div>
      )}
      {groups.map((g) => (
        <section key={g.title} className={c.group} data-loading={loading || undefined}>
          <h2>{g.title}<small>{g.items.length}</small></h2>
          <ul className={c.list}>
            {g.items.map((a) => {
              const meta = KINDS.find((k) => k.kind === a.kind)!;
              const isNew = !seenAt || a.at > seenAt;
              return (
                <li key={`${a.kind}:${a.id}`}>
                  <Link href={alertHref(a, data?.keyId, days)} className={c.item} data-kind={a.kind}>
                    <span className={c.kindIcon} data-kind={a.kind}><meta.icon size={17} /></span>
                    <span className={c.itemBody}>
                      <span className={c.itemTop}>
                        <b className={c.kindLabel} data-kind={a.kind}>{meta.label}</b>
                        {a.posts ? <span className={c.posts}>{a.posts} post</span> : null}
                        {isNew && <span className={c.new}>Baru</span>}
                      </span>
                      <span className={c.text}>{a.text || "—"}</span>
                    </span>
                    <span className={c.time} title={dayjs(a.at).locale("id").format("D MMMM YYYY, HH:mm")}>
                      {dayjs(a.at).locale("id").format("HH:mm")}<small>{dayjs(a.at).locale("id").fromNow()}</small>
                    </span>
                    <IconArrowRight size={15} className={c.arrow} aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
