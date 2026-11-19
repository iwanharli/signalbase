"use client";
// Top-bar bell: what Media visual found in the last 24 hours that needs a look (calls to action, narratives several posts
// share, sensitive images). A dot counts the ones newer than the last time the bell was opened (kept in this browser).
import { useEffect, useState } from "react";
import Link from "next/link";
import { Indicator, Popover } from "@mantine/core";
import { IconAlertTriangle, IconBell, IconMessages, IconSpeakerphone } from "@tabler/icons-react";
import dayjs from "dayjs";
import "dayjs/locale/id";
import relativeTime from "dayjs/plugin/relativeTime";
import { alertHref, unseenAlerts, type VisualAlert } from "@/lib/mediaVisual";
import classes from "./shell.module.css";

dayjs.extend(relativeTime);
const CHECK_MS = 5 * 60_000;
const SEEN_KEY = "sb.mediaAlertsSeen";
const LABEL = { action: "Ajakan aksi", narrative: "Narasi menyebar", sensitive: "Perlu ditinjau" } as const;
const ICON = { action: IconSpeakerphone, narrative: IconMessages, sensitive: IconAlertTriangle } as const;

const readSeen = () => { try { return localStorage.getItem(SEEN_KEY); } catch { return null; } };
const writeSeen = (v: string) => { try { localStorage.setItem(SEEN_KEY, v); } catch { /* private mode: count resets */ } };

export function MediaAlertsBell() {
  const [data, setData] = useState<{ alerts: VisualAlert[]; keyId: string | null } | null>(null);
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setSeenAt(readSeen());
    let stop = false;
    const check = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/admin/media-visual/alerts", { cache: "no-store" });
        if (res.ok && !stop) setData(await res.json());
      } catch { /* offline: keep the last list */ }
    };
    check();
    const id = setInterval(check, CHECK_MS);
    document.addEventListener("visibilitychange", check);
    return () => { stop = true; clearInterval(id); document.removeEventListener("visibilitychange", check); };
  }, []);
  const alerts = data?.alerts ?? [];
  const unseen = unseenAlerts(alerts, seenAt);
  const toggle = () => {
    if (!open && alerts.length) { const now = alerts[0].at; writeSeen(now); setSeenAt(now); }
    setOpen((o) => !o);
  };
  return (
    <Popover opened={open} onChange={setOpen} position="bottom-end" width={360} shadow="md" withinPortal zIndex={400}>
      <Popover.Target>
        <Indicator disabled={!unseen} label={unseen > 9 ? "9+" : unseen} size={16} color="red" offset={6}>
          <button type="button" className={`${classes.iconLink} ${classes.bellLink}`} onClick={toggle} aria-label={unseen ? `${unseen} notifikasi media baru` : "Notifikasi media"}>
            <IconBell size={18} stroke={1.8} />
          </button>
        </Indicator>
      </Popover.Target>
      <Popover.Dropdown className={classes.alertsDrop}>
        <b className={classes.alertsHead}>Media visual · 24 jam terakhir</b>
        {!alerts.length ? <p className={classes.alertsEmpty}>Belum ada ajakan aksi, narasi menyebar, atau gambar sensitif.</p> : (
          <ul className={classes.alertsList}>
            {alerts.map((a) => {
              const Icon = ICON[a.kind];
              return (
                <li key={`${a.kind}:${a.id}`} data-kind={a.kind} data-new={(seenAt === null || a.at > seenAt) || undefined}>
                  <Link href={alertHref(a, data?.keyId)} onClick={() => setOpen(false)}>
                    <Icon size={15} />
                    <span>
                      <small>{LABEL[a.kind]}{a.posts ? ` · ${a.posts} post` : ""} · {dayjs(a.at).locale("id").fromNow()}</small>
                      {a.text || "—"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Popover.Dropdown>
    </Popover>
  );
}
