"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Modal, Skeleton, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconArrowLeft, IconArrowRight, IconDeviceFloppy, IconKey, IconPlugConnected, IconRobot, IconShieldOff } from "@tabler/icons-react";
import { api, post } from "@/lib/api-client";
import type { KeyScope } from "@/lib/media/keyScope";
import { formatNumber } from "@/lib/media/labels";
import { useApi } from "@/lib/useApi";
import { keyInputClasses, KeywordsInput, ScopeParams, ScopePreview } from "./ScopeFields";
import { formatDate, fromNow } from "./shared";
import classes from "./apiKeys.module.css";

type KeyDetail = {
  id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null; scope: KeyScope;
  classifier: { enabled: boolean; providerName: string; model: string; processed: number; lastError: string | null; lastRunAt: string | null } | null;
};

const sameScope = (a: KeyScope, b: KeyScope) => JSON.stringify(a) === JSON.stringify(b);

function AiSummary({ detail }: { detail: KeyDetail }) {
  const ai = detail.classifier;
  const state = !ai ? "off" : ai.lastError ? "error" : ai.enabled ? "on" : "paused";
  return (
    <Link href={`/api-keys/${detail.id}/ai`} className={classes.aiPanel} data-state={state}>
      <span className={classes.aiPanelIcon}><IconRobot size={20} /></span>
      <span className={classes.aiPanelBody}>
        <b>Kategorisasi AI</b>
        {!ai ? <small>Belum diatur. Beri setiap item satu kategori, mis. 8 Quick Win Kapolri.</small> : (
          <>
            <small>{ai.enabled ? "Aktif" : "Dijeda"} · {ai.providerName} · {ai.model}</small>
            <small>{formatNumber(ai.processed)} item dikategorikan{ai.lastRunAt ? ` · terakhir ${fromNow(ai.lastRunAt)}` : ""}</small>
            {ai.lastError && <small className={classes.aiPanelError}>{ai.lastError}</small>}
          </>
        )}
      </span>
      <span className={classes.aiPanelAction}>{ai ? "Atur" : "Siapkan"}<IconArrowRight size={15} /></span>
    </Link>
  );
}

/** /api-keys/[id] — view a key and edit its name, keywords, and scope. */
export function ApiKeyDetail({ keyId }: { keyId: string }) {
  const router = useRouter();
  const detail = useApi<KeyDetail>(`/api/admin/keys/${keyId}`);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<KeyScope | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  // Seed the form from the stored key (and again after each save).
  useEffect(() => {
    if (!detail.data) return;
    setName(detail.data.name);
    setScope(detail.data.scope);
  }, [detail.data]);

  const data = detail.data;
  const revoked = !!data?.revokedAt;
  const scopeChanged = !!data && !!scope && !sameScope(scope, data.scope);
  const dirty = !!data && !!scope && (name.trim() !== data.name || scopeChanged);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scope || !data) return;
    if (scopeChanged && data.classifier && !confirm("Cakupan berubah. Hasil kategorisasi AI untuk kunci ini akan dihapus dan diulang dari awal. Lanjutkan?")) return;
    setBusy(true);
    try {
      const result = await post(`/api/admin/keys/${keyId}`, { name, scope }, "PATCH") as { aiRestarted: boolean };
      notifications.show({ color: "teal", message: result.aiRestarted ? "Disimpan. Kategorisasi AI diulang dari awal." : "Perubahan disimpan" });
      detail.reload();
    } catch (err) {
      notifications.show({ color: "red", message: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    setBusy(true);
    try {
      await api(`/api/admin/keys/${keyId}`, { method: "DELETE" });
      notifications.show({ color: "gray", message: `Kunci "${data?.name}" dicabut` });
      router.push("/api-keys");
    } catch (err) {
      notifications.show({ color: "red", message: (err as Error).message });
      setBusy(false);
    }
  };

  if (detail.error) return <div className={classes.page}><Link href="/api-keys" className={classes.back}><IconArrowLeft size={16} />Kunci API</Link><div className={classes.empty}><b>{detail.error}</b></div></div>;

  return (
    <div className={classes.page}>
      <Link href="/api-keys" className={classes.back}><IconArrowLeft size={16} />Kunci API</Link>

      {!data || !scope ? <Skeleton h={160} radius={22} /> : (
        <header className={classes.detailHero}>
          <span className={classes.cardIcon} data-live={(!revoked && !!data.lastUsedAt) || undefined}><IconPlugConnected size={20} /></span>
          <div className={classes.detailTitle}>
            <h1>{data.name}</h1>
            <code>{data.prefix}••••••••</code>
          </div>
          <span className={classes.status} data-state={revoked ? "revoked" : "idle"}>{revoked ? "Dicabut" : "Aktif"}</span>
          <dl className={classes.detailMeta}>
            <div><dt>Dibuat</dt><dd>{formatDate(data.createdAt)}</dd></div>
            <div><dt>Terakhir dipakai</dt><dd>{data.lastUsedAt ? <span title={formatDate(data.lastUsedAt)}>{fromNow(data.lastUsedAt)}</span> : "Belum pernah"}</dd></div>
            {data.revokedAt && <div><dt>Dicabut</dt><dd>{formatDate(data.revokedAt)}</dd></div>}
          </dl>
        </header>
      )}

      {data && scope && (
        <div className={classes.createLayout}>
          <form className={classes.create} onSubmit={save}>
            <div className={classes.createHead}>
              <span className={classes.createIcon}><IconKey size={18} /></span>
              <div><b>Pengaturan kunci</b><small>{revoked ? "Kunci sudah dicabut dan tidak bisa diubah." : "Nilai kunci tidak berubah; aplikasi tidak perlu diperbarui."}</small></div>
            </div>
            <fieldset disabled={revoked} className={classes.fieldset}>
              <TextInput classNames={keyInputClasses} label="Nama aplikasi" value={name} onChange={(e) => setName(e.currentTarget.value)} required minLength={2} maxLength={80} />
              <KeywordsInput scope={scope} onChange={setScope} />
              <ScopeParams scope={scope} onChange={setScope} />
            </fieldset>
            <ScopePreview scope={scope} />
            {scopeChanged && data.classifier && (
              <div className={classes.warning}><IconAlertTriangle size={17} />Menyimpan cakupan baru akan mengulang kategorisasi AI dari awal.</div>
            )}
            {!revoked && (
              <div className={classes.createFoot}>
                <button type="button" className={classes.ghostLink} disabled={!dirty} onClick={() => { setName(data.name); setScope(data.scope); }}>Batalkan perubahan</button>
                <button type="submit" className={classes.primary} disabled={busy || !dirty || name.trim().length < 2}>
                  <IconDeviceFloppy size={16} />{busy ? "Menyimpan…" : "Simpan"}
                </button>
              </div>
            )}
          </form>

          <aside className={classes.detailSide}>
            <AiSummary detail={data} />
            {!revoked && (
              <div className={classes.dangerZone}>
                <b>Cabut kunci</b>
                <p>Aplikasi yang memakai kunci ini langsung kehilangan akses. Tidak bisa dibatalkan.</p>
                <button type="button" className={classes.revoke} onClick={() => setConfirmRevoke(true)}><IconShieldOff size={15} />Cabut kunci</button>
              </div>
            )}
          </aside>
        </div>
      )}

      <Modal opened={confirmRevoke} onClose={() => setConfirmRevoke(false)} centered radius={20} padding={0} withCloseButton={false}
        overlayProps={{ backgroundOpacity: 0.55, blur: 6 }} transitionProps={{ transition: "pop", duration: 200 }}>
        <div className={classes.confirm}>
          <span className={classes.confirmIcon}><IconShieldOff size={22} /></span>
          <b>Cabut kunci &ldquo;{data?.name}&rdquo;?</b>
          <p>Aplikasi yang memakai kunci ini langsung tidak bisa mengakses data. Tindakan ini tidak bisa dibatalkan.</p>
          <div className={classes.confirmActions}>
            <button type="button" className={classes.secondary} onClick={() => setConfirmRevoke(false)}>Batal</button>
            <button type="button" className={classes.danger} onClick={revoke} disabled={busy}>{busy ? "Mencabut…" : "Cabut kunci"}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
