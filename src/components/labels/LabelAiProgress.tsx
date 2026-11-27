"use client";
// Progress and results of AI labelling, laid out like the categorisation cards (same styles). Refreshes every 30 s.
import { useEffect, useState } from "react";
import { Modal } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconArrowRight, IconCheck, IconChecklist, IconClock, IconRefresh } from "@tabler/icons-react";
import dayjs from "dayjs";
import "dayjs/locale/id";
import relativeTime from "dayjs/plugin/relativeTime";
import { post } from "@/lib/api-client";
import { formatNumber, MEDIA_TYPE_LABEL } from "@/lib/media/labels";
import { AI_LABELS, AI_NO_LABEL, AI_REVIEW, labelColor } from "@/lib/media/manualLabels";
import type { MediaType } from "@/lib/media/types";
import type { LabelProgress, LabelTotals } from "@/lib/server/ai/labelProgress";
import { useApi } from "@/lib/useApi";
import { Button } from "../ui/Button";
import { projectPath } from "@/lib/activeProject";
import classes from "../classifier/projectClassifier.module.css";
import review from "../classifier/reviewPanel.module.css";

dayjs.extend(relativeTime);

const REFRESH_MS = 30_000;
const pct = (n: number, total: number | null) => (total ? Math.min(100, Math.round((n / total) * 100)) : 0);
type Failed = { total: number; items: { type: MediaType; code: string; error: string | null; attempts: number; source: string | null; publishedAt: string | null; text: string }[] };

export function LabelAiProgress({ keyId }: { keyId: string }) {
  const url = `/api/admin/projects/${keyId}/label-ai/progress`;
  const data = useApi<{ progress: LabelProgress | null }>(url);
  const totals = useApi<{ totals: LabelTotals }>(data.data?.progress ? `${url}?view=totals` : null);
  const reload = data.reload, recount = totals.reload;
  useEffect(() => {
    const timer = setInterval(() => { reload(); recount(); }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [reload, recount]);
  const p = data.data?.progress;
  if (!p) return data.error ? <p className={review.note}>{data.error}</p> : null;

  const counted = totals.data?.totals;
  const inRange = counted ? p.types.reduce((sum, t) => sum + (counted[t.type] ?? 0), 0) : null;
  const done = p.types.reduce((sum, t) => sum + t.checkedInRange, 0);
  const options = p.types[0]?.labels.map((l) => l.label) ?? [];

  return (
    <>
      <section className={classes.overallSection}>
        <div className={`${classes.overall} ${classes.overallWide}`}>
          <div className={classes.overallHead}>
            <small>Progres pelabelan AI{p.enabled ? "" : " · dijeda"}</small>
            <span className={classes.pct}>{inRange === null ? "…" : `${pct(done, inRange)}%`}</span>
          </div>
          <b className={classes.overallValue}>{formatNumber(done)}<span> / {inRange === null ? (totals.error ? "—" : "…") : formatNumber(inRange)} post</span></b>
          <span className={classes.meter}><i style={{ width: `${pct(done, inRange)}%` }} /></span>
          <dl className={classes.facts}>
            <div><dt>Dikirim hari ini</dt><dd>{formatNumber(p.todayCount)}</dd></div>
            <div><dt>Terlewat</dt><dd data-warn={p.failed > 0 || undefined}>{formatNumber(p.failed)}</dd></div>
            <div><dt>Terakhir jalan</dt><dd>{p.lastRunAt ? dayjs(p.lastRunAt).locale("id").fromNow() : "—"}</dd></div>
            <div><dt>Biaya / 1.000</dt><dd title="Perkiraan dari token dan pencarian yang tercatat">{p.perThousand === null ? "—" : `US$${p.perThousand.toLocaleString("id-ID", { maximumFractionDigits: 4 })}`}</dd></div>
          </dl>
        </div>
        {p.lastError && <div className={classes.error}><IconAlertTriangle size={16} />{p.lastError}</div>}
      </section>

      <div className={classes.results}>
        <section className={classes.progress}>
          {p.types.map((t) => {
            const range = counted ? counted[t.type] ?? null : null;
            const max = Math.max(1, t.none, ...t.labels.map((l) => l.n));
            const rows = [...t.labels.map((l) => ({ ...l, none: false })), { label: "Tidak ada label cocok", n: t.none, none: true }];
            return (
              <div key={t.type} className={classes.typeBlock}>
                <header>
                  <b>{MEDIA_TYPE_LABEL[t.type]}</b>
                  <span data-done={t.backfillDone || undefined}>
                    {t.backfillDone ? <><IconCheck size={12} />Selesai · mengikuti data baru</>
                      : t.oldest ? <><IconClock size={12} />Mundur ke {dayjs(t.oldest).locale("id").format("D MMM, HH:mm")}</>
                      : <><IconClock size={12} />Menunggu worker</>}
                  </span>
                  <small><b>{formatNumber(t.checkedInRange)}</b>{range !== null && <> / {formatNumber(range)}</>}</small>
                </header>
                {range !== null && <span className={classes.meter} data-thin><i style={{ width: `${pct(t.checkedInRange, range)}%` }} /></span>}
                <div className={classes.bars}>
                  {rows.map((row) => (
                    <div key={row.none ? "~none" : row.label} className={classes.bar} data-none={row.none || undefined} data-empty={row.n === 0 || undefined}>
                      <span className={classes.barCode} style={row.none ? undefined : { background: `var(--mantine-color-${labelColor(options, row.label)}-6)` }}>{row.none ? "—" : "●"}</span>
                      <span className={classes.barLabel} title={row.label}>{row.label}</span>
                      <span className={classes.barTrack}><i style={{ width: `${(row.n / max) * 100}%` }} /></span>
                      <span className={classes.barValue}>{formatNumber(row.n)}</span>
                      {/* Share of all posts the AI checked; one post can carry several labels. */}
                      <span className={classes.barPct}>{t.checked ? `${pct(row.n, t.checked)}%` : "—"}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          <p className={review.note}>Hanya label dari AI. Persentase dari post yang sudah diperiksa AI; totalnya bisa lebih dari 100% karena satu post bisa punya beberapa label.</p>
        </section>
        <Review keyId={keyId} type={p.types[0]?.type ?? "social"} p={p} onRetried={reload} />
      </div>
    </>
  );
}

function Review({ keyId, type, p, onRetried }: { keyId: string; type: MediaType; p: LabelProgress; onRetried: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const url = `/api/admin/projects/${keyId}/label-ai/failed`;
  const failed = useApi<Failed>(open ? url : null);
  // The page's default "analysed" and "relevant" filters would hide some results, so both are cleared.
  const view = (label: string) => `${projectPath(keyId, `/media/${type}`)}?label=${label}&analyzed=&relevance=`;

  const retry = async () => {
    setBusy(true);
    try {
      const { queued } = await post(url, {}) as { queued: number };
      notifications.show({ color: "teal", message: `${formatNumber(queued)} post masuk antrean. Worker akan mencobanya lagi${p.enabled ? "" : " setelah pelabelan diaktifkan"}.` });
      setOpen(false);
      onRetried();
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={review.card}>
      <header className={review.head}>
        <span className={review.icon}><IconChecklist size={16} /></span>
        <div><b>Tinjau hasil</b><small>Buka daftarnya, lalu koreksi label dari detail post bila perlu. Daftar dibuka per jenis media.</small></div>
      </header>
      <div className={review.links}>
        <a href={view(AI_REVIEW)}><span>Perlu diperiksa</span><b>{formatNumber(p.review)}</b><IconArrowRight size={14} /></a>
        <a href={view(AI_NO_LABEL)}><span>Tidak ada label cocok</span><b>{formatNumber(p.none)}</b><IconArrowRight size={14} /></a>
        <a href={view(AI_LABELS)}><span>Semua hasil</span><b>{formatNumber(p.withAiLabel)}</b><IconArrowRight size={14} /></a>
        <button type="button" onClick={() => setOpen(true)} data-warn={p.failed > 0 || undefined}><span>Terlewat (gagal)</span><b>{formatNumber(p.failed)}</b><IconArrowRight size={14} /></button>
      </div>

      <Modal opened={open} onClose={() => setOpen(false)} centered size="lg" radius={18} title="Post yang gagal dilabeli AI">
        <p className={review.note}>Worker mencoba tiap post paling banyak 3 kali. “Coba lagi” memasukkan semuanya ke antrean; worker harus berjalan.</p>
        {failed.error ? <p className={review.note}>{failed.error}</p> : !failed.data ? <p className={review.note}>Memuat…</p> : !failed.data.items.length ? (
          <p className={review.empty}>Tidak ada post yang terlewat.</p>
        ) : (
          <ol className={review.list}>
            {failed.data.items.map((i) => (
              <li key={`${i.type}:${i.code}`}>
                <small>{MEDIA_TYPE_LABEL[i.type]}{i.source ? ` · ${i.source}` : ""}{i.publishedAt ? ` · ${dayjs(i.publishedAt).locale("id").format("D MMM, HH:mm")}` : ""} · {i.attempts} percobaan</small>
                <p>{i.text || "(teks tidak tersedia)"}</p>
                {i.error && <small>{i.error}</small>}
              </li>
            ))}
          </ol>
        )}
        <div className={review.actions}>
          {p.failed > 0 && <span className={review.warn}><IconAlertTriangle size={14} />Mencoba lagi memakai kredit AI.</span>}
          <Button variant="secondary" onClick={() => setOpen(false)}>Tutup</Button>
          <Button variant="primary" icon={IconRefresh} onClick={retry} loading={busy} disabled={!p.failed}>Coba lagi{p.failed ? ` ${formatNumber(p.failed)}` : ""}</Button>
        </div>
      </Modal>
    </section>
  );
}
