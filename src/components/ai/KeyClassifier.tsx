"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Skeleton } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconArrowLeft, IconCheck, IconClock, IconPlayerPause, IconPlayerPlay, IconRobot, IconTrash } from "@tabler/icons-react";
import dayjs from "dayjs";
import "dayjs/locale/id";
import relativeTime from "dayjs/plugin/relativeTime";
import { api, post } from "@/lib/api-client";
import { NO_CATEGORY, type Category } from "@/lib/ai/classifier";
import { formatNumber, MEDIA_TYPE_LABEL } from "@/lib/media/labels";
import { MEDIA_TYPES, type MediaType } from "@/lib/media/types";
import { useApi } from "@/lib/useApi";
import { ClassifierEditor, draftProblems, emptyDraft, type ClassifierDraft, type ProviderOption } from "./ClassifierEditor";
import classes from "./keyClassifier.module.css";

dayjs.extend(relativeTime);

type Cursor = { newest?: { ts: string }; oldest?: { ts: string }; backfillDone?: boolean };
type ClassifierState = ClassifierDraft & {
  providerName: string | null; model: string | null; cursors: Partial<Record<MediaType, Cursor>>;
  processed: number; failed: number; todayCount: number; todayDate: string; lastError: string | null; lastRunAt: string | null;
};
type Response = {
  key: { id: string; name: string; prefix: string; revokedAt: string | null; scope: { types: MediaType[] } };
  classifier: ClassifierState | null;
  counts: { type: MediaType; category: string; n: number }[];
};

const REFRESH_MS = 30_000;
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

function Progress({ state, counts, categories, types }: { state: ClassifierState; counts: Response["counts"]; categories: Category[]; types: MediaType[] }) {
  const todayCount = state.todayDate === today() ? state.todayCount : 0;
  const labels = new Map([...categories.map((c) => [c.code, c.label] as const), [NO_CATEGORY, "Tidak termasuk"]]);
  const order = [...categories.map((c) => c.code), NO_CATEGORY];

  return (
    <section className={classes.progress}>
      <div className={classes.stats}>
        <div><b>{formatNumber(state.processed)}</b><span>Sudah dikategorikan</span></div>
        <div><b>{formatNumber(todayCount)}<small> / {formatNumber(state.dailyLimit)}</small></b><span>Hari ini</span></div>
        <div><b>{formatNumber(state.failed)}</b><span>Terlewat</span></div>
        <div><b>{state.lastRunAt ? dayjs(state.lastRunAt).locale("id").fromNow() : "—"}</b><span>Terakhir berjalan</span></div>
      </div>

      {state.lastError && <div className={classes.error}><IconAlertTriangle size={16} />{state.lastError}</div>}

      {types.map((type) => {
        const cursor = state.cursors?.[type];
        const typeCounts = counts.filter((c) => c.type === type);
        const total = typeCounts.reduce((sum, c) => sum + c.n, 0);
        const max = Math.max(1, ...typeCounts.map((c) => c.n));
        return (
          <div key={type} className={classes.typeBlock}>
            <header>
              <b>{MEDIA_TYPE_LABEL[type]}</b>
              <span data-done={cursor?.backfillDone || undefined}>
                {cursor?.backfillDone ? <><IconCheck size={13} />Seluruh data selesai · mengikuti data baru</>
                  : cursor?.oldest ? <><IconClock size={13} />Mundur sampai {dayjs(cursor.oldest.ts).locale("id").format("D MMM YYYY")}</>
                  : <><IconClock size={13} />Menunggu worker</>}
              </span>
              <small>{formatNumber(total)} item</small>
            </header>
            <div className={classes.bars}>
              {order.map((code) => {
                const n = typeCounts.find((c) => c.category === code)?.n ?? 0;
                return (
                  <div key={code} className={classes.bar} data-none={code === NO_CATEGORY || undefined}>
                    <span className={classes.barCode}>{code === NO_CATEGORY ? "—" : code}</span>
                    <span className={classes.barLabel}>{labels.get(code)}</span>
                    <span className={classes.barTrack}><i style={{ width: `${(n / max) * 100}%` }} /></span>
                    <span className={classes.barValue}>{formatNumber(n)}{total ? <small> · {Math.round((n / total) * 100)}%</small> : null}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}

/** /api-keys/[id]/ai — set up AI categorisation for an existing key and watch its progress. */
export function KeyClassifier({ keyId }: { keyId: string }) {
  const data = useApi<Response>(`/api/admin/keys/${keyId}/classifier`);
  const providers = useApi<ProviderOption[]>("/api/admin/ai-providers");
  const [draft, setDraft] = useState<ClassifierDraft | null>(null);
  const [busy, setBusy] = useState(false);

  // Seed the editor once from the stored settings.
  useEffect(() => {
    if (!data.data || draft) return;
    const c = data.data.classifier;
    setDraft(c ? { providerId: c.providerId, enabled: c.enabled, prompt: c.prompt, categories: c.categories, dailyLimit: c.dailyLimit } : emptyDraft());
  }, [data.data, draft]);

  // Progress moves in the background; refresh it while the page is open.
  const reload = data.reload;
  useEffect(() => {
    const timer = setInterval(reload, REFRESH_MS);
    return () => clearInterval(timer);
  }, [reload]);

  const save = async (patch: Partial<ClassifierDraft> = {}) => {
    if (!draft) return;
    const next = { ...draft, ...patch };
    const problems = draftProblems(next);
    if (problems.length) return notifications.show({ color: "red", message: problems[0] });
    const stored = data.data?.classifier;
    const restarts = stored && (stored.prompt !== next.prompt || JSON.stringify(stored.categories) !== JSON.stringify(next.categories) || stored.providerId !== next.providerId);
    if (restarts && !confirm("Prompt, kategori, atau penyedia berubah. Hasil kategorisasi sebelumnya akan dihapus dan diulang dari awal. Lanjutkan?")) return;
    setBusy(true);
    try {
      await post(`/api/admin/keys/${keyId}/classifier`, next, "PUT");
      setDraft(next);
      notifications.show({ color: "teal", message: stored ? "Pengaturan disimpan" : "Kategorisasi AI diaktifkan" });
      data.reload();
    } catch (err) {
      notifications.show({ color: "red", message: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm("Matikan kategorisasi AI dan hapus semua hasilnya untuk kunci ini?")) return;
    setBusy(true);
    try {
      await api(`/api/admin/keys/${keyId}/classifier`, { method: "DELETE" });
      setDraft(emptyDraft());
      data.reload();
    } finally {
      setBusy(false);
    }
  };

  const key = data.data?.key;
  const state = data.data?.classifier;
  const types = key?.scope.types.length ? key.scope.types : [...MEDIA_TYPES];

  return (
    <div className={classes.page}>
      <Link href="/api-keys" className={classes.back}><IconArrowLeft size={16} />Kunci API</Link>
      <header className={classes.title}>
        <span className={classes.icon}><IconRobot size={22} /></span>
        <div>
          <h1>Kategorisasi AI {key && <em>· {key.name}</em>}</h1>
          <p>Setiap item dalam cakupan kunci ini diberi satu kategori oleh AI, lalu dikirim lewat API sebagai <code>classification</code>.</p>
        </div>
        {state && (
          <span className={classes.state} data-on={state.enabled || undefined}>{state.enabled ? "Aktif" : "Dijeda"}</span>
        )}
      </header>

      {key?.revokedAt && <div className={classes.error}><IconAlertTriangle size={16} />Kunci ini sudah dicabut, kategorisasi tidak berjalan.</div>}

      <div className={classes.layout}>
        <section className={classes.editorCard}>
          {!draft ? <Skeleton h={420} radius={16} /> : (
            <>
              <ClassifierEditor draft={draft} onChange={setDraft} providers={providers.data} providersLoading={providers.loading} />
              <footer className={classes.actions}>
                {state && (
                  <>
                    <button type="button" className={classes.ghost} onClick={remove} disabled={busy}><IconTrash size={15} />Matikan &amp; hapus hasil</button>
                    <button type="button" className={classes.ghost} onClick={() => save({ enabled: !state.enabled })} disabled={busy}>
                      {state.enabled ? <><IconPlayerPause size={15} />Jeda</> : <><IconPlayerPlay size={15} />Lanjutkan</>}
                    </button>
                  </>
                )}
                <button type="button" className={classes.primary} onClick={() => save()} disabled={busy || !!key?.revokedAt}>
                  {busy ? "Menyimpan…" : state ? "Simpan pengaturan" : "Aktifkan kategorisasi"}
                </button>
              </footer>
            </>
          )}
        </section>

        <aside>
          {!data.data ? <Skeleton h={300} radius={20} /> : state && draft ? (
            <Progress state={state} counts={data.data.counts} categories={state.categories} types={types} />
          ) : (
            <div className={classes.idle}>
              <IconRobot size={26} />
              <b>Belum aktif</b>
              <p>Pilih penyedia, tulis prompt dan kategori (atau pakai preset 8 Quick Win), lalu aktifkan. Worker mulai memproses dalam satu menit.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
