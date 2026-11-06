"use client";
import { useState } from "react";
import Link from "next/link";
import { Modal, Skeleton } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAdjustmentsHorizontal, IconClock, IconKey, IconPlugConnected, IconPlus, IconShieldOff, IconTag } from "@tabler/icons-react";
import { api } from "@/lib/api-client";
import { useApi } from "@/lib/useApi";
import { formatDate, fromNow, isRecentlyUsed, KeywordChips, RestrictionChips, scopeRestrictions, useProvinceNames, type ApiKeyRow } from "./shared";
import classes from "./apiKeys.module.css";

function KeyCard({ apiKey, onRevoke, provinceName }: { apiKey: ApiKeyRow; onRevoke: (key: ApiKeyRow) => void; provinceName: (code: string) => string }) {
  const revoked = !!apiKey.revokedAt;
  const recent = isRecentlyUsed(apiKey);
  return (
    <article className={classes.card} data-revoked={revoked || undefined}>
      <header className={classes.cardHead}>
        <span className={classes.cardIcon} data-live={(!revoked && recent) || undefined}><IconPlugConnected size={18} /></span>
        <div className={classes.cardTitle}>
          <b>{apiKey.name}</b>
          <code>{apiKey.prefix}••••••••</code>
        </div>
        <span className={classes.status} data-state={revoked ? "revoked" : recent ? "live" : "idle"}>
          {revoked ? "Dicabut" : recent ? "Aktif dipakai" : "Aktif"}
        </span>
      </header>

      <div className={classes.cardSection}>
        <span className={classes.sectionLabel}><IconTag size={13} />Kata kunci</span>
        <KeywordChips keywords={apiKey.keywords} />
      </div>
      <div className={classes.cardSection}>
        <span className={classes.sectionLabel}><IconAdjustmentsHorizontal size={13} />Parameter</span>
        <RestrictionChips restrictions={scopeRestrictions(apiKey.scope, provinceName)} />
      </div>

      <dl className={classes.meta}>
        <div><dt>Dibuat</dt><dd>{formatDate(apiKey.createdAt)}</dd></div>
        <div><dt>Terakhir dipakai</dt><dd>{apiKey.lastUsedAt ? <span title={formatDate(apiKey.lastUsedAt)}>{fromNow(apiKey.lastUsedAt)}</span> : "Belum pernah"}</dd></div>
        {revoked && <div><dt>Dicabut</dt><dd>{formatDate(apiKey.revokedAt!)}</dd></div>}
      </dl>

      {!revoked && <button type="button" className={classes.revoke} onClick={() => onRevoke(apiKey)}><IconShieldOff size={15} />Cabut kunci</button>}
    </article>
  );
}

function RevokeModal({ apiKey, onCancel, onConfirm, busy }: { apiKey: ApiKeyRow | null; onCancel: () => void; onConfirm: () => void; busy: boolean }) {
  return (
    <Modal opened={!!apiKey} onClose={onCancel} centered radius={20} padding={0} withCloseButton={false}
      overlayProps={{ backgroundOpacity: 0.55, blur: 6 }} transitionProps={{ transition: "pop", duration: 200 }}>
      {apiKey && (
        <div className={classes.confirm}>
          <span className={classes.confirmIcon}><IconShieldOff size={22} /></span>
          <b>Cabut kunci &ldquo;{apiKey.name}&rdquo;?</b>
          <p>Aplikasi yang memakai kunci ini langsung tidak bisa mengakses data. Tindakan ini tidak bisa dibatalkan.</p>
          <div className={classes.confirmActions}>
            <button type="button" className={classes.secondary} onClick={onCancel}>Batal</button>
            <button type="button" className={classes.danger} onClick={onConfirm} disabled={busy}>{busy ? "Mencabut…" : "Cabut kunci"}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** /api-keys — every key as a card; creating one happens on /api-keys/new. */
export function ApiKeyList() {
  const keys = useApi<ApiKeyRow[]>("/api/admin/keys");
  const provinceName = useProvinceNames();
  const [revoking, setRevoking] = useState<ApiKeyRow | null>(null);
  const [busy, setBusy] = useState(false);

  const all = keys.data ?? [];
  const active = all.filter((k) => !k.revokedAt);
  const revoked = all.filter((k) => k.revokedAt);
  const usedToday = active.filter(isRecentlyUsed).length;

  const confirmRevoke = async () => {
    if (!revoking) return;
    setBusy(true);
    try {
      await api(`/api/admin/keys/${revoking.id}`, { method: "DELETE" });
      notifications.show({ color: "gray", message: `Kunci "${revoking.name}" dicabut` });
      setRevoking(null);
      keys.reload();
    } catch (err) {
      notifications.show({ color: "red", message: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={classes.page}>
      <header className={classes.hero}>
        <div className={classes.heroGrid} aria-hidden />
        <div className={classes.heroText}>
          <span className={classes.badge}><IconKey size={13} />Akses API</span>
          <h1>Kunci <em>API</em></h1>
          <p>Akses baca untuk aplikasi lain, misalnya KIPERMAS. Setiap kunci bisa dibatasi dengan kata kunci dan dicabut kapan saja.</p>
          <Link href="/api-keys/new" className={`${classes.primary} ${classes.heroAction}`}><IconPlus size={17} />Buat kunci</Link>
        </div>
        <div className={classes.stats}>
          <div><b>{keys.data ? active.length : "—"}</b><span>Aktif</span></div>
          <div><b>{keys.data ? usedToday : "—"}</b><span>Dipakai 24 jam</span></div>
          <div><b>{keys.data ? revoked.length : "—"}</b><span>Dicabut</span></div>
        </div>
      </header>

      <section>
        <h2 className={classes.heading}>Kunci aktif <span>{active.length}</span></h2>
        {!keys.data ? (
          <div className={classes.grid}>{[0, 1].map((i) => <Skeleton key={i} h={210} radius={20} />)}</div>
        ) : active.length ? (
          <div className={classes.grid}>{active.map((k) => <KeyCard key={k.id} apiKey={k} onRevoke={setRevoking} provinceName={provinceName} />)}</div>
        ) : (
          <div className={classes.empty}>
            <IconKey size={26} /><b>Belum ada kunci aktif</b><span>Buat kunci untuk menghubungkan aplikasi.</span>
            <Link href="/api-keys/new" className={classes.primary}><IconPlus size={16} />Buat kunci</Link>
          </div>
        )}
      </section>

      {revoked.length > 0 && (
        <section>
          <h2 className={classes.heading}>Dicabut <span>{revoked.length}</span></h2>
          <div className={classes.grid}>{revoked.map((k) => <KeyCard key={k.id} apiKey={k} onRevoke={setRevoking} provinceName={provinceName} />)}</div>
        </section>
      )}

      <p className={classes.footnote}><IconClock size={14} />Waktu &ldquo;terakhir dipakai&rdquo; diperbarui paling sering sekali per menit.</p>

      <RevokeModal apiKey={revoking} onCancel={() => setRevoking(null)} onConfirm={confirmRevoke} busy={busy} />
    </div>
  );
}
