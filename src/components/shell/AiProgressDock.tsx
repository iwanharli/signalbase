"use client";
// Bottom-right dock: AI categorisation and AI labelling progress of the projects the account can see, on every panel
// page. It sits in the shell, outside the page, so it stays put and keeps its data while moving between pages.
// Shown: a small card, one line per project. Hidden: only a progress ring. The choice is kept in this browser.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Tooltip } from "@mantine/core";
import { IconAlertTriangle, IconCheck, IconMinus, IconX } from "@tabler/icons-react";
import dayjs from "dayjs";
import "dayjs/locale/id";
import type { ProgressState, TypeProgress } from "@/lib/ai/progress";
import { formatNumber } from "@/lib/media/labels";
import classes from "./aiProgressDock.module.css";

type Kind = "category" | "label";
const KINDS: Record<Kind, { title: string; href: (id: string) => string }> = {
  category: { title: "Kategorisasi AI", href: (id) => `/project/${id}/ai` },
  label: { title: "Pelabelan AI", href: (id) => `/project/${id}?tab=labels` },
};

type Project = {
  kind: Kind;
  /** Labelling: set once today's limit is used up. */
  id: string; name: string; owner: string | null; state: ProgressState; pct: number | null; types: TypeProgress[];
  done: number; today: number; active: boolean; lastRunAt: string | null; error: string | null;
};

const CHECK_MS = 30_000;
const HIDDEN_KEY = "sb.aiDockHidden";
const readHidden = () => { try { return localStorage.getItem(HIDDEN_KEY) === "1"; } catch { return false; } };
const writeHidden = (v: boolean) => { try { localStorage.setItem(HIDDEN_KEY, v ? "1" : "0"); } catch { /* private mode */ } };

/** Finished rows closed with their X, kept in this browser. */
const DISMISSED_KEY = "sb.aiDockDismissed";
const readDismissed = (): string[] => { try { const v = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
const writeDismissed = (v: string[]) => { try { localStorage.setItem(DISMISSED_KEY, JSON.stringify(v)); } catch { /* private mode */ } };
const rowKey = (p: Project) => `${p.kind}:${p.id}`;
/** Only a row that is finished and trouble-free can stay closed. */
const done = (p: Project) => p.state === "live" && !p.error;

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
  const [all, setProjects] = useState<Project[] | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [hidden, setHidden] = useState(true); // until localStorage is read, so it never flashes open

  useEffect(() => {
    setHidden(readHidden());
    setDismissed(readDismissed());
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

  // A closed row with work or an error again is forgotten, so it shows now and again once it finishes.
  useEffect(() => {
    if (!all) return;
    const reopened = new Set(all.filter((p) => !done(p)).map(rowKey));
    setDismissed((list) => {
      if (!list.some((k) => reopened.has(k))) return list;
      const next = list.filter((k) => !reopened.has(k));
      writeDismissed(next);
      return next;
    });
  }, [all]);

  // Other bottom-right buttons (the media page's back-to-top) sit above the dock: its height, gap included, as a CSS variable.
  const dockObserver = useRef<ResizeObserver | null>(null);
  const dockRef = useCallback((el: HTMLElement | null) => {
    const root = document.documentElement;
    dockObserver.current?.disconnect();
    dockObserver.current = null;
    if (!el) { root.style.removeProperty("--ai-dock-space"); return; }
    dockObserver.current = new ResizeObserver(() => root.style.setProperty("--ai-dock-space", `${el.offsetHeight + 12}px`));
    dockObserver.current.observe(el);
  }, []);

  const projects = all?.filter((p) => !(done(p) && dismissed.includes(rowKey(p))));
  if (!projects?.length) return null;
  const dismiss = (p: Project) => setDismissed((list) => {
    const next = [...list, rowKey(p)];
    writeDismissed(next);
    return next;
  });
  const toggle = () => setHidden((h) => { writeHidden(!h); return !h; });
  const working = projects.filter((p) => p.state !== "live");
  const allLive = !working.length;
  // The ring follows the least advanced project: the one people are waiting for.
  const ringPct = allLive ? 100 : working.some((p) => p.pct === null) ? null : Math.min(...working.map((p) => p.pct!));
  const hasError = projects.some((p) => p.error);
  const kinds = (Object.keys(KINDS) as Kind[]).filter((k) => projects.some((p) => p.kind === k));
  const ringLabel = allLive ? "Proses AI: semua mengikuti data baru" : `Proses AI: ${working.length} proses berjalan${ringPct !== null ? `, ${ringPct}%` : ""}`;

  if (hidden) {
    return (
      <aside ref={dockRef} className={classes.dock} aria-label="Progres proses AI">
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
    <aside ref={dockRef} className={classes.dock} aria-label="Progres proses AI">
      <div className={classes.card} data-working={working.some((p) => p.active) || undefined}>
        <header className={classes.head}>
          <span><i className={classes.dot} data-live={allLive || undefined} aria-hidden />Proses AI</span>
          <button type="button" onClick={toggle} className={classes.hide} aria-label="Sembunyikan progres"><IconMinus size={14} /></button>
        </header>
        <ul className={classes.list}>
          {kinds.flatMap((kind) => sortProjects(projects.filter((p) => p.kind === kind)).map((p, i) => (
            <li key={`${kind}:${p.id}`}>
              {i === 0 && <span className={classes.group}>{KINDS[kind].title}</span>}
              <div className={classes.item}>
              {done(p) && (
                <Tooltip label="Hide" position="left" withArrow>
                  <button type="button" className={classes.dismiss} onClick={() => dismiss(p)} aria-label={`Sembunyikan ${p.name} dari ${KINDS[kind].title}`}>
                    <IconX size={11} stroke={3} />
                  </button>
                </Tooltip>
              )}
              <Link href={KINDS[kind].href(p.id)} className={classes.row} title={p.error ?? undefined}>
                <span className={classes.top}>
                  <b>{p.name}</b>
                  {p.owner && <small>{p.owner}</small>}
                  {p.error && <IconAlertTriangle size={12} className={classes.warn} />}
                  <em data-live={p.state === "live" || undefined}>{p.state === "live" ? <IconCheck size={12} stroke={2.6} /> : p.pct === null ? "…" : `${p.pct}%`}</em>
                </span>
                <span className={classes.bar} data-state={p.state} data-active={(p.active && p.state !== "live") || undefined}><i style={{ width: `${p.pct ?? 0}%` }} /></span>
                <small className={classes.note}>{note(p)}</small>
              </Link>
              </div>
            </li>
          )))}
        </ul>
      </div>
    </aside>
  );
}
