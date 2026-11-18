"use client";
// Top-bar alert for admins: the media worker has stopped (no heartbeat for WORKER_STALE_MS) or the local analysis
// service isn't answering. Nothing is shown while it works. Checked every few minutes while the tab is visible.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Tooltip } from "@mantine/core";
import { IconPhotoExclamation } from "@tabler/icons-react";
import { workerProblem, type VisualWorker } from "@/lib/mediaVisual";
import classes from "./shell.module.css";

const CHECK_MS = 3 * 60_000;

export function MediaWorkerAlert() {
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    let stop = false;
    const check = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/admin/media-visual/worker", { cache: "no-store" });
        if (res.ok && !stop) setProblem(workerProblem((await res.json() as { worker: VisualWorker }).worker));
      } catch { /* offline: keep the last state */ }
    };
    check();
    const id = setInterval(check, CHECK_MS);
    document.addEventListener("visibilitychange", check);
    return () => { stop = true; clearInterval(id); document.removeEventListener("visibilitychange", check); };
  }, []);
  if (!problem) return null;
  return (
    <Tooltip label={`${problem}. Klik untuk melihat status.`} withArrow openDelay={150}>
      <Link href="/analisis/media" className={`${classes.iconLink} ${classes.alertLink}`} aria-label={problem}><IconPhotoExclamation size={18} stroke={1.8} /></Link>
    </Tooltip>
  );
}
