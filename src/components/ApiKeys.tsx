"use client";
import { useState } from "react";
import { CopyButton, Modal, Skeleton, TagsInput, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle, IconCheck, IconClock, IconCopy, IconDatabase, IconKey, IconPlugConnected, IconPlus, IconShieldOff, IconTag, IconX,
} from "@tabler/icons-react";
import dayjs from "dayjs";
import "dayjs/locale/id";
import relativeTime from "dayjs/plugin/relativeTime";
import { api, post } from "@/lib/api-client";
import { useApi } from "@/lib/useApi";
import classes from "./apiKeys.module.css";

dayjs.extend(relativeTime);

type ApiKeyRow = { id: string; name: string; prefix: string; keywords: string[]; createdAt: string; lastUsedAt: string | null; revokedAt: string | null };
type CreatedKey = { name: string; key: string };

const RECENTLY_USED_MS = 24 * 60 * 60_000;

const formatDate = (value: string) => dayjs(value).locale("id").format("D MMM YYYY, HH:mm");
const fromNow = (value: string) => dayjs(value).locale("id").fromNow();
const isRecentlyUsed = (key: ApiKeyRow) => !!key.lastUsedAt && Date.now() - new Date(key.lastUsedAt).getTime() < RECENTLY_USED_MS;

/** Human description of what a key with these keywords can read. */
function scopeText(keywords: string[]) {
  if (!keywords.length) return "Kunci ini akan membaca seluruh bank data.";
  const list = keywords.length === 1 ? keywords[0] : `${keywords.slice(0, -1).join(", ")} atau ${keywords.at(-1)}`;
  return `Hanya post dan berita yang menyebut ${list}.`;
}

function KeywordChips({ keywords }: { keywords: string[] }) {
  if (!keywords.length) return <div className={classes.chips}><span className={classes.chip} data-all>seluruh bank</span></div>;
  return <div className={classes.chips}>{keywords.map((w) => <span key={w} className={classes.chip}>{w}</span>)}</div>;
}

function CreateKeyForm({ onCreated }: { onCreated: (key: CreatedKey) => void }) {
  const [name, setName] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      onCreated(await post("/api/admin/keys", { name, keywords }) as CreatedKey);
      setName("");
      setKeywords([]);
    } catch (err) {
      notifications.show({ color: "red", message: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const inputClasses = { input: classes.input, label: classes.inputLabel, description: classes.inputDescription, pill: classes.pill };
  return (
    <form className={classes.create} onSubmit={submit}>
      <div className={classes.createHead}>
        <span className={classes.createIcon}><IconPlus size={18} /></span>
        <div><b>Buat kunci baru</b><small>Satu kunci per aplikasi memudahkan pencabutan.</small></div>
      </div>
      <div className={classes.createFields}>
        <TextInput classNames={inputClasses} label="Nama aplikasi" placeholder="mis. KIPERMAS produksi" value={name}
          onChange={(e) => setName(e.currentTarget.value)} required minLength={2} maxLength={80} />
        <TagsInput classNames={inputClasses} label="Kata kunci" description="Pisahkan dengan koma atau spasi. Kosong = seluruh bank."
          placeholder="mis. polri, polisi" value={keywords} onChange={setKeywords} splitChars={[",", " "]} clearable />
      </div>
      <div className={classes.createFoot}>
        <p className={classes.scope}><IconDatabase size={15} />{scopeText(keywords)}</p>
        <button type="submit" className={classes.primary} disabled={busy || name.trim().length < 2}>
          <IconKey size={16} />{busy ? "Membuat…" : "Buat kunci"}
        </button>
      </div>
    </form>
  );
}

function KeyCard({ apiKey, onRevoke }: { apiKey: ApiKeyRow; onRevoke: (key: ApiKeyRow) => void }) {
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
        <span className={classes.sectionLabel}><IconTag size={13} />Cakupan</span>
        <KeywordChips keywords={apiKey.keywords} />
      </div>

      <dl className={classes.meta}>
        <div><dt>Dibuat</dt><dd>{formatDate(apiKey.createdAt)}</dd></div>
        <div><dt>Terakhir dipakai</dt><dd>{apiKey.lastUsedAt ? <span title={formatDate(apiKey.lastUsedAt)}>{fromNow(apiKey.lastUsedAt)}</span> : "Belum pernah"}</dd></div>
        {revoked && <div><dt>Dicabut</dt><dd>{formatDate(apiKey.revokedAt!)}</dd></div>}
      </dl>

      {!revoked && (
        <button type="button" className={classes.revoke} onClick={() => onRevoke(apiKey)}><IconShieldOff size={15} />Cabut kunci</button>
      )}
    </article>
  );
}

function CreatedKeyModal({ created, onClose }: { created: CreatedKey | null; onClose: () => void }) {
  const origin = typeof window === "undefined" ? "https://<host>" : window.location.origin;
  const example = created ? `curl -H "Authorization: Bearer ${created.key}" \\\n  "${origin}/api/v1/media/online?size=10"` : "";
  return (
    <Modal opened={!!created} onClose={onClose} centered size="lg" radius={22} padding={0} withCloseButton={false}
      overlayProps={{ backgroundOpacity: 0.55, blur: 6 }} transitionProps={{ transition: "pop", duration: 240 }}>
      {created && (
        <div className={classes.modal}>
          <header className={classes.modalHead}>
            <span className={classes.createIcon}><IconCheck size={18} /></span>
            <div><b>Kunci untuk {created.name}</b><small>Simpan sebagai secret di aplikasi tersebut.</small></div>
            <button type="button" className={classes.close} onClick={onClose} aria-label="Tutup"><IconX size={18} /></button>
          </header>
          <div className={classes.modalBody}>
            <div className={classes.warning}><IconAlertTriangle size={17} />Salin sekarang. Kunci ini hanya ditampilkan sekali dan tidak bisa dilihat lagi.</div>
            <div className={classes.secret}>
              <code>{created.key}</code>
              <CopyButton value={created.key}>
                {({ copied, copy }) => (
                  <button type="button" className={classes.primary} data-copied={copied || undefined} onClick={copy}>
                    {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}{copied ? "Tersalin" : "Salin"}
                  </button>
                )}
              </CopyButton>
            </div>
            <span className={classes.sectionLabel}>Coba langsung</span>
            <pre className={classes.example}>{example}</pre>
          </div>
        </div>
      )}
    </Modal>
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

export function ApiKeys() {
  const keys = useApi<ApiKeyRow[]>("/api/admin/keys");
  const [created, setCreated] = useState<CreatedKey | null>(null);
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
        </div>
        <div className={classes.stats}>
          <div><b>{keys.data ? active.length : "—"}</b><span>Aktif</span></div>
          <div><b>{keys.data ? usedToday : "—"}</b><span>Dipakai 24 jam</span></div>
          <div><b>{keys.data ? revoked.length : "—"}</b><span>Dicabut</span></div>
        </div>
      </header>

      <CreateKeyForm onCreated={(key) => { setCreated(key); keys.reload(); }} />

      <section>
        <h2 className={classes.heading}>Kunci aktif <span>{active.length}</span></h2>
        {!keys.data ? (
          <div className={classes.grid}>{[0, 1].map((i) => <Skeleton key={i} h={210} radius={20} />)}</div>
        ) : active.length ? (
          <div className={classes.grid}>{active.map((k) => <KeyCard key={k.id} apiKey={k} onRevoke={setRevoking} />)}</div>
        ) : (
          <div className={classes.empty}><IconKey size={26} /><b>Belum ada kunci aktif</b><span>Buat kunci di atas untuk menghubungkan aplikasi.</span></div>
        )}
      </section>

      {revoked.length > 0 && (
        <section>
          <h2 className={classes.heading}>Dicabut <span>{revoked.length}</span></h2>
          <div className={classes.grid}>{revoked.map((k) => <KeyCard key={k.id} apiKey={k} onRevoke={setRevoking} />)}</div>
        </section>
      )}

      <p className={classes.footnote}><IconClock size={14} />Waktu &ldquo;terakhir dipakai&rdquo; diperbarui paling sering sekali per menit.</p>

      <CreatedKeyModal created={created} onClose={() => setCreated(null)} />
      <RevokeModal apiKey={revoking} onCancel={() => setRevoking(null)} onConfirm={confirmRevoke} busy={busy} />
    </div>
  );
}
