"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Modal, Skeleton } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconEye, IconKey, IconPencil, IconPlugConnected, IconPlus, IconRobot, IconSearch, IconShieldOff, IconX } from "@tabler/icons-react";
import { api } from "@/lib/api-client";
import { formatNumber } from "@/lib/media/labels";
import { useApi } from "@/lib/useApi";
import { Button, ButtonGroup, StatusPill } from "../ui/Button";
import { CopyKeyButton } from "./CopyKeyButton";
import { formatDate, fromNow, isRecentlyUsed, scopeRestrictions, useProvinceNames, type ApiKeyRow } from "./shared";
import classes from "./apiKeyList.module.css";
import { Tip } from "../ui/Tip";

type Filter = "active" | "revoked";

/** The media browser as this key sees it, on the first media type it may read. */
const viewHref = (key: ApiKeyRow) => `/media/${key.scope.types[0] ?? "social"}?key=${key.id}`;

function AiCell({ apiKey }: { apiKey: ApiKeyRow }) {
  const ai = apiKey.classifier;
  if (!ai) return <span className={classes.muted}>—</span>;
  const autoPaused = !ai.enabled && !!ai.lastError?.startsWith("Dijeda otomatis");
  const tone = autoPaused ? "warning" : ai.lastError ? "danger" : ai.enabled ? "success" : "warning";
  return (
    <Tip label={ai.lastError ?? `${ai.providerName} · ${formatNumber(ai.processed)} item`}>
      <span className={classes.aiCell}>
        <StatusPill tone={tone}>{autoPaused ? "Dijeda otomatis" : ai.lastError ? "Error" : ai.enabled ? "Aktif" : "Dijeda"}</StatusPill>
        <small>{formatNumber(ai.processed)} item</small>
      </span>
    </Tip>
  );
}

function KeyRow({ apiKey, provinceName, onRevoke }: { apiKey: ApiKeyRow; provinceName: (code: string) => string; onRevoke: (key: ApiKeyRow) => void }) {
  const revoked = !!apiKey.revokedAt;
  const recent = isRecentlyUsed(apiKey);
  const restrictions = scopeRestrictions(apiKey.scope, provinceName);
  const href = `/api-keys/${apiKey.id}`;

  return (
    <div className={classes.row} role="row" data-revoked={revoked || undefined}>
      <div className={classes.nameCell} role="cell">
        <span className={classes.icon} data-live={(!revoked && recent) || undefined}><IconPlugConnected size={17} /></span>
        <Link href={href} className={classes.name}>
          <b>{apiKey.name}</b>
          <code>{apiKey.prefix}••••</code>
        </Link>
      </div>

      <div className={classes.cell} role="cell" data-label="Kata kunci">
        {apiKey.keywords.length
          ? <span className={classes.chips}>{apiKey.keywords.slice(0, 3).map((w) => <span key={w} className={classes.chip}>{w}</span>)}{apiKey.keywords.length > 3 && <span className={classes.more}>+{apiKey.keywords.length - 3}</span>}</span>
          : <span className={classes.muted}>Semua</span>}
      </div>

      <div className={classes.cell} role="cell" data-label="Cakupan">
        {restrictions.length ? <Tip label={restrictions.join(" · ")}><span className={classes.clamp}>{restrictions.join(" · ")}</span></Tip> : <span className={classes.muted}>Tanpa batasan</span>}
      </div>

      <div className={classes.cell} role="cell" data-label="AI"><AiCell apiKey={apiKey} /></div>

      <div className={classes.cell} role="cell" data-label="Pembuat">
        {apiKey.createdBy ? <span className={classes.creator}><i>{apiKey.createdBy[0].toUpperCase()}</i>{apiKey.createdBy}</span> : <span className={classes.muted}>—</span>}
      </div>

      <div className={classes.cell} role="cell" data-label="Terakhir dipakai">
        {revoked
          ? <StatusPill tone="neutral">Dicabut {formatDate(apiKey.revokedAt!).split(",")[0]}</StatusPill>
          : apiKey.lastUsedAt ? <Tip label={formatDate(apiKey.lastUsedAt)}><span>{fromNow(apiKey.lastUsedAt)}</span></Tip> : <span className={classes.muted}>Belum pernah</span>}
      </div>

      <div className={classes.actions} role="cell">
        {!revoked && <Button size="sm" variant="secondary" icon={IconEye} href={viewHref(apiKey)}>Data</Button>}
        <ButtonGroup>
          {!revoked && <CopyKeyButton keyId={apiKey.id} copyable={apiKey.copyable} iconOnly />}
          <Button size="sm" variant="secondary" iconOnly icon={IconPencil} href={href}>{revoked ? "Lihat detail" : "Edit kunci"}</Button>
          {!revoked && <Button size="sm" variant="dangerOutline" iconOnly icon={IconShieldOff} onClick={() => onRevoke(apiKey)}>Cabut kunci</Button>}
        </ButtonGroup>
      </div>
    </div>
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
            <Button variant="secondary" block onClick={onCancel}>Batal</Button>
            <Button variant="danger" block icon={IconShieldOff} onClick={onConfirm} loading={busy}>{busy ? "Mencabut…" : "Cabut kunci"}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** /api-keys — every key as a row; creating and editing happen on their own pages. */
export function ApiKeyList() {
  const keys = useApi<ApiKeyRow[]>("/api/admin/keys");
  const provinceName = useProvinceNames();
  const [filter, setFilter] = useState<Filter>("active");
  const [search, setSearch] = useState("");
  const [revoking, setRevoking] = useState<ApiKeyRow | null>(null);
  const [busy, setBusy] = useState(false);

  const all = useMemo(() => keys.data ?? [], [keys.data]);
  const active = all.filter((k) => !k.revokedAt);
  const revoked = all.filter((k) => k.revokedAt);
  const usedToday = active.filter(isRecentlyUsed).length;
  const withAi = active.filter((k) => k.classifier?.enabled).length;

  const term = search.trim().toLowerCase();
  const rows = (filter === "active" ? active : revoked).filter((k) =>
    !term || k.name.toLowerCase().includes(term) || k.prefix.toLowerCase().includes(term) || k.keywords.some((w) => w.includes(term)));

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
          <p>Kelola akses aplikasi eksternal ke bank data media. Setiap kunci memiliki cakupan data dan kategorisasi AI tersendiri, serta dapat dicabut sewaktu-waktu.</p>
        </div>
        <div className={classes.heroSide}>
          <div className={classes.stats}>
            <div><b>{keys.data ? active.length : "—"}</b><span>Aktif</span></div>
            <div><b>{keys.data ? usedToday : "—"}</b><span>Dipakai 24 jam</span></div>
            <div><b>{keys.data ? withAi : "—"}</b><span>Dengan AI</span></div>
          </div>
          <Button variant="primary" icon={IconPlus} href="/api-keys/new">Buat kunci</Button>
        </div>
      </header>

      <section className={classes.list} role="table" aria-label="Daftar kunci API">
        <div className={classes.toolbar}>
          <div className={classes.tabs} role="tablist">
            {([["active", "Aktif", active.length], ["revoked", "Dicabut", revoked.length]] as const).map(([id, label, n]) => (
              <button key={id} type="button" role="tab" aria-selected={filter === id} data-active={filter === id || undefined} onClick={() => setFilter(id)}>
                {label}<span>{n}</span>
              </button>
            ))}
          </div>
          <label className={classes.search}>
            <IconSearch size={15} />
            <input value={search} onChange={(e) => setSearch(e.currentTarget.value)} placeholder="Cari nama, prefix, atau kata kunci" />
            {search && <button type="button" onClick={() => setSearch("")} aria-label="Hapus pencarian"><IconX size={14} /></button>}
          </label>
        </div>

        <div className={classes.head} role="row">
          <span role="columnheader">Kunci</span><span role="columnheader">Kata kunci</span><span role="columnheader">Cakupan</span>
          <span role="columnheader"><IconRobot size={13} />AI</span><span role="columnheader">Pembuat</span><span role="columnheader">Terakhir dipakai</span><span role="columnheader">Aksi</span>
        </div>

        {!keys.data ? (
          Array.from({ length: 3 }, (_, i) => <div key={i} className={classes.skeletonRow}><Skeleton h={22} radius="md" /></div>)
        ) : rows.length ? (
          rows.map((k) => <KeyRow key={k.id} apiKey={k} provinceName={provinceName} onRevoke={setRevoking} />)
        ) : (
          <div className={classes.empty}>
            <IconKey size={24} />
            <b>{term ? "Tidak ada kunci yang cocok" : filter === "active" ? "Belum ada kunci aktif" : "Belum ada kunci yang dicabut"}</b>
            {!term && filter === "active" && <Button variant="primary" size="sm" icon={IconPlus} href="/api-keys/new">Buat kunci</Button>}
          </div>
        )}
      </section>

      <RevokeModal apiKey={revoking} onCancel={() => setRevoking(null)} onConfirm={confirmRevoke} busy={busy} />
    </div>
  );
}
