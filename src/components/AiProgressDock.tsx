"use client";
// Bottom-right dock: AI categorisation progress of the projects the account can see (admins: all of them), on every panel
// page. It sits in the shell, outside the page, so it stays put and keeps its data while moving between pages.
// Shown: a small card, one line per project. Hidden: only a progress ring. The choice is kept in this browser.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Tooltip } from "@mantine/core";
import { IconAlertTriangle, IconCheck, IconMinus } from "@tabler/icons-react";
import dayjs from "dayjs";
import "dayjs/locale/id";
import type { ProgressState, TypeProgress } from "@/lib/ai/progress";
import { formatNumber } from "@/lib/media/labels";
import classes from "./aiProgress.module.css";

type Project = {
  id: string; name: string; owner: string | null; state: ProgressState; pct: number | null; types: TypeProgress[];
  done: number; today: number; active: boolean; lastRunAt: string | null; error: string | null;
};

const CHECK_MS = 30_000;
const HIDDEN_KEY = "sb.aiDockHidden";
const readHidden = () => { try { return localStorage.getItem(HIDDEN_KEY) === "1"; } catch { return false; } };
const writeHidden = (v: boolean) => { try { localStorage.setItem(HIDDEN_KEY, v ? "1" : "0"); } catch { /* private mode */ } };

/** Unfinished projects first (least advanced on top), then the ones already following new posts. */
const ORDER: Record<ProgressState, number> = { backfill: 0, waiting: 1, live: 2 };
const sortProjects = (ps: Project[]) => [...ps].sort((a, b) => ORDER[a.state] - ORDER[b.state] || (a.pct ?? 0) - (b.pct ?? 0) || a.name.localeCompare(b.name));

/** One short line under the bar: how far back it has got, or that it is following new posts. */
function note(p: Project) {
  if (p.state === "live") return `Mengikuti data baru · +${formatNumber(p.today)} hari ini`;
  if (p.state === "waiting") return "Menunggu giliran";
  const reached = p.types.map((t) => t.reached).filter((r): r is string => !!r).sort()[0];
  return `${reached ? `Sampai ${dayjs(reached).locale("id").format("D MMM")}` : "Melabel"} · +${formatNumber(p.today)} hari ini`;
}

/** Progress ring; an unknown share spins instead of guessing. */
function Ring({ pct, live }: { pct: number | null; live: boolean }) {
  const size = 30, r = 12, c = 2 * Math.PI * r;
  return (
    <svg className={classes.ring} width={size} height={size} viewBox={`0 0 ${size} ${size}`} data-spin={pct === null || undefined} aria-hidden>
      <defs><linearGradient id="sbAiRing" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8b5cf6" /><stop offset="1" stopColor="#22d3ee" /></linearGradient></defs>
      <circle cx={15} cy={15} r={r} className={classes.ringTrack} />
      <circle cx={15} cy={15} r={r} className={classes.ringValue} data-live={live || undefined}
        strokeDasharray={c} strokeDashoffset={pct === null ? c * 0.72 : c * (1 - pct / 100)} />
    </svg>
  );
}

export function AiProgressDock() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [hidden, setHidden] = useState(true); // until localStorage is read, so it never flashes open

  useEffect(() => {
    setHidden(readHidden());
    let stop = false;
    const check = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/admin/ai-progress", { cache: "no-store" });
        if (res.ok && !stop) setProjects((await res.json()).projects);
      } catch { /* offline: keep the last numbers */ }
    };
    check();
    const id = setInterval(check, CHECK_MS);
    document.addEventListener("visibilitychange", check);
    return () => { stop = true; clearInterval(id); document.removeEventListener("visibilitychange", check); };
  }, []);

  if (!projects?.length) return null;
  const toggle = () => setHidden((h) => { writeHidden(!h); return !h; });
  const working = projects.filter((p) => p.state !== "live");
  const allLive = !working.length;
  // The ring follows the least advanced project: the one people are waiting for.
  const ringPct = allLive ? 100 : working.some((p) => p.pct === null) ? null : Math.min(...working.map((p) => p.pct!));
  const hasError = projects.some((p) => p.error);
  const ringLabel = allLive ? "Kategorisasi AI: semua mengikuti data baru" : `Kategorisasi AI: ${working.length} proyek melabel${ringPct !== null ? `, ${ringPct}%` : ""}`;

  if (hidden) {
    return (
      <aside className={classes.dock} aria-label="Progres kategorisasi AI">
        <Tooltip label={ringLabel} position="left" withArrow openDelay={200}>
          <button type="button" className={classes.ringButton} onClick={toggle} aria-label={`${ringLabel}. Tampilkan`} data-warn={hasError || undefined} data-working={working.some((p) => p.active) || undefined}>
            <Ring pct={ringPct} live={allLive} />
            <span className={classes.ringCenter}>{allLive ? <IconCheck size={12} stroke={2.6} /> : ringPct !== null ? ringPct : ""}</span>
          </button>
        </Tooltip>
      </aside>
    );
  }

  return (
    <aside className={classes.dock} aria-label="Progres kategorisasi AI">
      <div className={classes.card} data-working={working.some((p) => p.active) || undefined}>
        <header className={classes.head}>
          <span><i className={classes.dot} data-live={allLive || undefined} aria-hidden />Kategorisasi AI</span>
          <button type="button" onClick={toggle} className={classes.hide} aria-label="Sembunyikan progres"><IconMinus size={14} /></button>
        </header>
        <ul className={classes.list}>
          {sortProjects(projects).map((p) => (
            <li key={p.id}>
              <Link href={`/project/${p.id}/ai`} className={classes.row} title={p.error ?? undefined}>
                <span className={classes.top}>
                  <b>{p.name}</b>
                  {p.owner && <small>{p.owner}</small>}
                  {p.error && <IconAlertTriangle size={12} className={classes.warn} />}
                  <em data-live={p.state === "live" || undefined}>{p.state === "live" ? <IconCheck size={12} stroke={2.6} /> : p.pct === null ? "…" : `${p.pct}%`}</em>
                </span>
                <span className={classes.bar} data-state={p.state} data-active={(p.active && p.state !== "live") || undefined}><i style={{ width: `${p.pct ?? 0}%` }} /></span>
                <small className={classes.note}>{note(p)}</small>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
