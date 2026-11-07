"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconArrowLeft, IconCheck, IconClock, IconPlayerPause, IconPlayerPlay, IconRobot, IconTrash } from "@tabler/icons-react";
import dayjs from "dayjs";
import "dayjs/locale/id";
import relativeTime from "dayjs/plugin/relativeTime";
import { api, post } from "@/lib/api-client";
import { categoriesForType, NO_CATEGORY, type Category } from "@/lib/ai/classifier";
import { formatNumber, MEDIA_TYPE_LABEL } from "@/lib/media/labels";
import { MEDIA_TYPES, type MediaType } from "@/lib/media/types";
import { useApi } from "@/lib/useApi";
import { BalanceCard } from "./BalanceCard";
import { ClassifierEditor, draftProblems, emptyDraft, estimateUrl, money, type ClassifierDraft, type Estimate } from "./ClassifierEditor";
import classes from "./keyClassifier.module.css";
import { RestartConfirm, type RestartRequest } from "./RestartConfirm";
import { ConfirmDialog } from "../ui/ConfirmDialog";

dayjs.extend(relativeTime);

type Cursor = { newest?: { ts: string }; oldest?: { ts: string }; backfillDone?: boolean };
type StoredProvider = { kind: ClassifierDraft["provider"]["kind"]; baseUrl: string | null; model: string; apiKeyHint: string };
type ClassifierState = Omit<ClassifierDraft, "provider"> & {
  provider: StoredProvider; cursors: Partial<Record<MediaType, Cursor>>;
  processed: number; failed: number; todayCount: number; todayDate: string; lastError: string | null; lastRunAt: string | null;
};
type Response = {
  key: { id: string; name: string; prefix: string; revokedAt: string | null; scope: { types: MediaType[] } };
  classifier: ClassifierState | null;
  counts: { type: MediaType; category: string; n: number }[];
};

const REFRESH_MS = 30_000;
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

function Progress({ state, counts, types, keyId }: { state: ClassifierState; counts: Response["counts"]; types: MediaType[]; keyId: string }) {
  const todayCount = state.todayDate === today() ? state.todayCount : 0;
  const estimate = useApi<Estimate>(estimateUrl(keyId, state.startFrom ?? null));
  const e = estimate.data;
  const done = counts.reduce((sum, c) => sum + c.n, 0);
  const inRange = e ? (e.social ?? 0) + (e.online ?? 0) : null;
  const pct = (n: number, total: number | null) => (total ? Math.min(100, Math.round((n / total) * 100)) : 0);

  return (
    <section className={classes.progress}>
      <div className={classes.overall}>
        <div className={classes.overallHead}>
          <small>Progres kategorisasi</small>
          <span className={classes.pct}>{inRange === null ? "…" : `${pct(e!.done, inRange)}%`}</span>
        </div>
        <b className={classes.overallValue}>{formatNumber(e ? e.done : done)}<span> / {inRange === null ? "…" : formatNumber(inRange)} item</span></b>
        <span className={classes.meter}><i style={{ width: `${inRange ? pct(e!.done, inRange) : 0}%` }} /></span>
        <dl className={classes.facts}>
          <div><dt>Hari ini</dt><dd>{formatNumber(todayCount)}</dd></div>
          <div><dt>Terlewat</dt><dd data-warn={state.failed > 0 || undefined}>{formatNumber(state.failed)}</dd></div>
          <div><dt>Terakhir jalan</dt><dd>{state.lastRunAt ? dayjs(state.lastRunAt).locale("id").fromNow() : "—"}</dd></div>
          <div><dt>Biaya / 1.000</dt><dd>{e?.cost ? money(e.cost.perThousand, e.cost.currency) : "—"}</dd></div>
        </dl>
      </div>

      {state.lastError && <div className={classes.error}><IconAlertTriangle size={16} />{state.lastError}</div>}

      {types.map((type) => {
        const cursor = state.cursors?.[type];
        const typeCounts = counts.filter((c) => c.type === type);
        const total = typeCounts.reduce((sum, c) => sum + c.n, 0);
        const typeRange = e ? e[type] : null;
        const max = Math.max(1, ...typeCounts.map((c) => c.n));
        const categories = categoriesForType(state, type) as Category[];
        const labels = new Map([...categories.map((c) => [c.code, c.label] as const), [NO_CATEGORY, "Tidak termasuk"]]);
        const order = [...categories.map((c) => c.code), NO_CATEGORY];
        return (
          <div key={type} className={classes.typeBlock}>
            <header>
              <b>{MEDIA_TYPE_LABEL[type]}</b>
              <span data-done={cursor?.backfillDone || undefined}>
                {cursor?.backfillDone ? <><IconCheck size={12} />Selesai · mengikuti data baru</>
                  : cursor?.oldest ? <><IconClock size={12} />Mundur ke {dayjs(cursor.oldest.ts).locale("id").format("D MMM, HH:mm")}</>
                  : <><IconClock size={12} />Menunggu worker</>}
              </span>
              <small><b>{formatNumber(total)}</b>{typeRange != null && <> / {formatNumber(typeRange)}</>}</small>
            </header>
            {typeRange != null && <span className={classes.meter} data-thin><i style={{ width: `${pct(e!.doneByType[type], typeRange)}%` }} /></span>}
            <div className={classes.bars}>
              {order.map((code) => {
                const n = typeCounts.find((c) => c.category === code)?.n ?? 0;
                return (
                  <div key={code} className={classes.bar} data-none={code === NO_CATEGORY || undefined} data-empty={n === 0 || undefined}>
                    <span className={classes.barCode}>{code === NO_CATEGORY ? "—" : code}</span>
                    <span className={classes.barLabel} title={labels.get(code)}>{labels.get(code)}</span>
                    <span className={classes.barTrack}><i style={{ width: `${(n / max) * 100}%` }} /></span>
                    <span className={classes.barValue}>{formatNumber(n)}</span>
                    <span className={classes.barPct}>{total ? `${Math.round((n / total) * 100)}%` : "—"}</span>
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

/** Placeholder shaped like the editor: provider block, fields, prompt, category rows. */
function EditorSkeleton() {
  return (
    <div className={classes.skeleton} aria-hidden>
      <div className={classes.skBox}>
        <i style={{ width: "28%" }} />
        <div className={classes.skRow}><i data-pill /><i data-pill /><i data-pill /><i data-pill /></div>
        <div className={classes.skRow}><i data-field /><i data-field /></div>
        <i data-field />
      </div>
      <i style={{ width: "18%" }} />
      <i data-area />
      {[0, 1, 2].map((n) => <div key={n} className={classes.skRow}><i data-code /><i data-field style={{ flex: 1 }} /></div>)}
    </div>
  );
}

/** Placeholder shaped like the progress panel: stat tiles and category bars. */
function ProgressSkeleton() {
  return (
    <div className={`${classes.progress} ${classes.skeletonLight}`} aria-hidden>
      <div className={classes.stats}>{[0, 1, 2, 3].map((n) => <div key={n}><i style={{ width: "50%", height: 20 }} /><i style={{ width: "70%" }} /></div>)}</div>
      {[0, 1, 2, 3, 4, 5].map((n) => <div key={n} className={classes.skBar}><i data-code /><i style={{ width: `${70 - n * 9}%` }} /></div>)}
    </div>
  );
}

/** /api-keys/[id]/ai — set up AI categorisation for an existing key and watch its progress. */
export function KeyClassifier({ keyId }: { keyId: string }) {
  const data = useApi<Response>(`/api/admin/keys/${keyId}/classifier`);
  const [draft, setDraft] = useState<ClassifierDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [restart, setRestart] = useState<RestartRequest | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  // Seed the editor once from the stored settings.
  useEffect(() => {
    if (!data.data || draft) return;
    const c = data.data.classifier;
    setDraft(c
      ? { provider: { kind: c.provider.kind, baseUrl: c.provider.baseUrl ?? "", model: c.provider.model, apiKey: "" }, enabled: c.enabled, prompt: c.prompt, categories: c.categories, onlineCategories: c.onlineCategories ?? null, labelledOnly: c.labelledOnly ?? false, startFrom: c.startFrom ?? null }
      : emptyDraft());
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
    const problems = draftProblems(next, !!data.data?.classifier);
    if (problems.length) return notifications.show({ color: "red", message: problems[0] });
    const stored = data.data?.classifier;
    const changes = !stored ? [] : [
      stored.prompt !== next.prompt && "prompt",
      JSON.stringify(stored.categories) !== JSON.stringify(next.categories) && (next.onlineCategories || stored.onlineCategories ? "kategori media sosial" : "kategori"),
      JSON.stringify(categoriesForType(stored, "online")) !== JSON.stringify(categoriesForType(next, "online"))
        && (next.onlineCategories || stored.onlineCategories) && "kategori media online",
      stored.provider.kind !== next.provider.kind && "penyedia",
      stored.provider.model !== next.provider.model.trim() && "model",
      (stored.provider.baseUrl ?? "") !== (next.provider.kind === "openai_compatible" ? next.provider.baseUrl.trim() : "") && "base URL",
    ].filter((c): c is string => !!c);
    const results = data.data?.counts.reduce((sum, c) => sum + c.n, 0) ?? 0;
    if (changes.length && results > 0) return setRestart({ changes, results, run: () => persist(next) });
    return persist(next);
  };

  const persist = async (next: ClassifierDraft) => {
    const stored = data.data?.classifier;
    setBusy(true);
    try {
      await post(`/api/admin/keys/${keyId}/classifier`, next, "PUT");
      setDraft(next);
      const title = stored ? "Pengaturan disimpan" : "Kategorisasi AI diaktifkan";
      const id = notifications.show({ color: "teal", title, message: "Menghitung data yang akan dikategorikan…", loading: true, autoClose: false });
      api<Estimate>(estimateUrl(keyId, next.startFrom))
        .then((e) => notifications.update({ id, color: "teal", title, loading: false, autoClose: 8000, message: [
          e.social !== null && `Media sosial ${formatNumber(e.social)}`, e.online !== null && `Media online ${formatNumber(e.online)}`,
          `Total ${formatNumber((e.social ?? 0) + (e.online ?? 0))} item`,
          e.cost && `perkiraan biaya sisa ≈ ${money(e.cost.remaining, e.cost.currency)}`,
        ].filter(Boolean).join(" · ") }))
        .catch(() => notifications.update({ id, color: "teal", title, loading: false, autoClose: 4000, message: "Jumlah data belum bisa dihitung" }));
      data.reload();
    } catch (err) {
      notifications.show({ color: "red", message: (err as Error).message });
    } finally {
      setBusy(false);
      setRestart(null);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api(`/api/admin/keys/${keyId}/classifier`, { method: "DELETE" });
      setDraft(emptyDraft());
      data.reload();
    } finally {
      setBusy(false);
      setConfirmRemove(false);
    }
  };

  const key = data.data?.key;
  const state = data.data?.classifier;
  const types = key?.scope.types.length ? key.scope.types : [...MEDIA_TYPES];

  return (
    <div className={classes.page}>
      <RestartConfirm request={restart} onClose={() => setRestart(null)} loading={busy} />
      <ConfirmDialog opened={confirmRemove} onClose={() => setConfirmRemove(false)} onConfirm={remove} loading={busy} icon={IconTrash}
        title="Matikan kategorisasi AI?" confirmLabel="Matikan & hapus"
        description={<>Semua hasil kategorisasi untuk kunci ini ({formatNumber(data.data?.counts.reduce((sum, c) => sum + c.n, 0) ?? 0)} item) dihapus dan pengaturan penyedia AI dilepas. Data di bank sumber tidak berubah.</>} />
      <Link href={`/api-keys/${keyId}`} className={classes.back}><IconArrowLeft size={16} />{key?.name ?? "Detail kunci"}</Link>
      <header className={classes.title}>
        <span className={classes.icon}><IconRobot size={22} /></span>
        <div>
          <h1>Kategorisasi AI {key && <em>· {key.name}</em>}</h1>
          <p>Setiap item dalam cakupan kunci ini diberi satu kategori oleh AI, lalu dikirim lewat API sebagai <code>classification</code>.</p>
        </div>
        {state && (
          <div className={classes.titleSide}>
            <span className={classes.state} data-on={state.enabled || undefined}>{state.enabled ? "Aktif" : "Dijeda"}</span>
            <div className={classes.balance}><BalanceCard keyId={keyId} compact /></div>
          </div>
        )}
      </header>

      {key?.revokedAt && <div className={classes.error}><IconAlertTriangle size={16} />Kunci ini sudah dicabut, kategorisasi tidak berjalan.</div>}

      <div className={classes.layout}>
        <section className={classes.editorCard}>
          {!draft ? <EditorSkeleton /> : (
            <>
              <ClassifierEditor draft={draft} onChange={setDraft} storedKeyHint={state?.provider.apiKeyHint} apiKeyId={keyId} />
              <footer className={classes.actions}>
                {state && (
                  <>
                    <button type="button" className={classes.ghost} onClick={() => setConfirmRemove(true)} disabled={busy}><IconTrash size={15} />Matikan &amp; hapus hasil</button>
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

        <aside className={classes.side}>
          {!data.data ? <ProgressSkeleton /> : state && draft ? (
            <>
              <Progress state={state} counts={data.data.counts} types={types} keyId={keyId} />
            </>
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
