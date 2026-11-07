"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CopyButton, Modal, Skeleton, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAdjustmentsHorizontal, IconAlertTriangle, IconArrowLeft, IconArrowRight, IconCalendar, IconCheck, IconClock, IconCopy, IconDeviceFloppy, IconEye, IconRefresh, IconId, IconLayoutDashboard, IconPlugConnected,
  IconRobot, IconShieldLock, IconShieldOff, IconTag,
} from "@tabler/icons-react";
import { api, post } from "@/lib/api-client";
import { keyScopeSchema, type KeyScope } from "@/lib/media/keyScope";
import { formatNumber } from "@/lib/media/labels";
import { useApi } from "@/lib/useApi";
import { Button, StatusPill } from "../ui/Button";
import { BalanceCard } from "../ai/BalanceCard";
import { CopyKeyButton } from "./CopyKeyButton";
import { SectionLayout, SectionNav, SectionPanel, type SectionItem } from "./KeySections";
import { keyInputClasses, KeywordsInput, ScopeParams } from "./ScopeFields";
import { formatDate, fromNow, scopeRestrictions, useProvinceNames } from "./shared";
import classes from "./apiKeys.module.css";
import { RestartConfirm, type RestartRequest } from "../ai/RestartConfirm";

type KeyDetail = {
  id: string; name: string; prefix: string; createdBy: string | null; createdAt: string; lastUsedAt: string | null; revokedAt: string | null; scope: KeyScope; copyable: boolean;
  classifier: { enabled: boolean; providerName: string; model: string; processed: number; lastError: string | null; lastRunAt: string | null } | null;
};
type Tab = "overview" | "identity" | "keywords" | "scope" | "ai" | "security";

const sameScope = (a: KeyScope, b: KeyScope) => JSON.stringify(a) === JSON.stringify(b);
const sameKeywords = (a: string[], b: string[]) => JSON.stringify(a) === JSON.stringify(b);

function aiStatus(ai: KeyDetail["classifier"]) {
  if (!ai) return { state: "off", text: "Belum diatur" };
  if (ai.lastError) return { state: "error", text: "Error" };
  return { state: ai.enabled ? "on" : "paused", text: `${ai.enabled ? "Aktif" : "Dijeda"} · ${formatNumber(ai.processed)} item` };
}

/** AI tab: status, provider, progress and the provider balance, with links to the full settings. */
function AiOverview({ detail }: { detail: KeyDetail }) {
  const ai = detail.classifier;
  const settings = `/api-keys/${detail.id}/ai`;
  if (!ai) {
    return (
      <div className={classes.aiEmpty}>
        <span className={classes.aiEmptyIcon}><IconRobot size={22} /></span>
        <b>Kategorisasi AI belum diatur</b>
        <p>Beri setiap post dan berita dalam cakupan kunci ini satu kategori, misalnya 8 Quick Win Kapolri, memakai Claude, DeepSeek, atau penyedia lain.</p>
        <Button variant="primary" icon={IconRobot} href={settings}>Siapkan kategorisasi AI</Button>
      </div>
    );
  }
  const status = aiStatus(ai);
  return (
    <div className={classes.aiOverview}>
      <div className={classes.aiStats}>
        <div><small>Status</small><StatusPill tone={status.state === "on" ? "success" : status.state === "error" ? "danger" : "warning"}>{ai.lastError ? "Error" : ai.enabled ? "Aktif" : "Dijeda"}</StatusPill></div>
        <div><small>Penyedia</small><b>{ai.providerName}</b><span>{ai.model}</span></div>
        <div><small>Dikategorikan</small><b>{formatNumber(ai.processed)}</b><span>item</span></div>
        <div><small>Terakhir berjalan</small><b>{ai.lastRunAt ? fromNow(ai.lastRunAt) : "Belum pernah"}</b></div>
      </div>
      {ai.lastError && <div className={classes.warning}><IconAlertTriangle size={17} />{ai.lastError}</div>}
      <BalanceCard keyId={detail.id} onDark />
      <div className={classes.aiActions}>
        <Button onDark variant="secondary" icon={IconEye} href={`/media/${detail.scope.types[0] ?? "social"}?key=${detail.id}`}>Lihat hasil</Button>
        <Button variant="primary" iconRight={IconArrowRight} href={settings}>Buka pengaturan AI</Button>
      </div>
    </div>
  );
}

/** /api-keys/[id] — a key's overview and settings, grouped in a side sub-menu. */
export function ApiKeyDetail({ keyId }: { keyId: string }) {
  const router = useRouter();
  const detail = useApi<KeyDetail>(`/api/admin/keys/${keyId}`);
  const provinceName = useProvinceNames();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const tabs: Tab[] = ["overview", "identity", "keywords", "scope", "ai", "security"];
  const tab = tabs.includes(requestedTab as Tab) ? requestedTab as Tab : "overview";
  const setTab = (next: Tab) => {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.pushState(null, "", url);
  };
  const [name, setName] = useState("");
  const [scope, setScope] = useState<KeyScope | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [restart, setRestart] = useState<RestartRequest | null>(null);
  const [rotated, setRotated] = useState<string | null>(null);

  const draftKey = `signalbase:key-draft:${keyId}`;
  const initialized = useRef(false);
  // Restore only drafts based on this exact saved configuration.
  // This also preserves edits when browser Back leaves the page.

  useEffect(() => {
    if (!detail.data) return;
    if (!initialized.current) {
      initialized.current = true;
      try {
        const raw = sessionStorage.getItem(draftKey);
        if (raw) {
          const draft = JSON.parse(raw);
          const parsed = keyScopeSchema.safeParse(draft.scope);
          if (!detail.data.revokedAt && draft.base === JSON.stringify([detail.data.name, detail.data.scope]) && typeof draft.name === "string" && parsed.success) {
            setName(draft.name);
            setScope(parsed.data);
            notifications.show({ color: "blue", message: "Perubahan yang belum disimpan dipulihkan dari sesi ini." });
            return;
          }
          sessionStorage.removeItem(draftKey);
        }
      } catch { /* Storage may be unavailable; the navigation guard still works. */ }
    }
    setName(detail.data.name);
    setScope(detail.data.scope);
  }, [detail.data, draftKey]);

  const data = detail.data;
  const revoked = !!data?.revokedAt;
  const ready = !!data && !!scope;
  const nameChanged = ready && name.trim() !== data.name;
  const keywordsChanged = ready && !sameKeywords(scope.keywords, data.scope.keywords);
  const scopeChanged = ready && !sameScope(scope, data.scope);
  // Everything in the scope except the keywords, which have their own tab.
  const paramsChanged = ready && !sameScope({ ...scope, keywords: [] }, { ...data.scope, keywords: [] });
  const dirty = nameChanged || scopeChanged;
  const restrictions = scope ? scopeRestrictions(scope, provinceName) : [];

  useEffect(() => {
    if (!dirty || revoked) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const onLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const next = new URL(link.href, window.location.href);
      if (next.pathname === window.location.pathname && next.search === window.location.search) return;
      if (!window.confirm("Ada perubahan yang belum disimpan. Tinggalkan halaman dan buang perubahan?")) {
        event.preventDefault(); event.stopPropagation();
      } else {
        try { sessionStorage.removeItem(draftKey); } catch { /* Storage is optional. */ }
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onLink, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", onLink, true); };
  }, [dirty, revoked, draftKey]);

  useEffect(() => {
    if (!ready) return;
    try {
      if (dirty && !revoked) sessionStorage.setItem(draftKey, JSON.stringify({ base: JSON.stringify([data.name, data.scope]), name, scope }));
      else sessionStorage.removeItem(draftKey);
    } catch { /* Editing remains available when session storage is disabled. */ }
  }, [ready, dirty, revoked, draftKey, data, name, scope]);

  const reset = () => { if (data) { setName(data.name); setScope(data.scope); } };

  const save = async () => {
    if (!scope || !data) return;
    if (name.trim().length < 2) { setTab("identity"); return notifications.show({ color: "red", message: "Nama minimal 2 karakter" }); }
    if (scopeChanged && data.classifier && data.classifier.processed > 0) {
      return setRestart({ changes: ["kata kunci atau cakupan"], results: data.classifier.processed, run: persist });
    }
    return persist();
  };

  const persist = async () => {
    setBusy(true);
    try {
      const result = await post(`/api/admin/keys/${keyId}`, { name, scope }, "PATCH") as { aiRestarted: boolean };
      notifications.show({ color: "teal", message: result.aiRestarted ? "Disimpan. Kategorisasi AI diulang dari awal." : "Perubahan disimpan" });
      await detail.reload();
    } catch (err) {
      notifications.show({ color: "red", message: (err as Error).message });
    } finally {
      setBusy(false);
      setRestart(null);
    }
  };

  const rotate = async () => {
    setBusy(true);
    try {
      const { key } = await post(`/api/admin/keys/${keyId}/rotate`, {}) as { key: string };
      setConfirmRotate(false);
      setRotated(key);
      await detail.reload();
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

  if (detail.error) {
    return (
      <div className={classes.page}>
        <Link href="/api-keys" className={classes.back}><IconArrowLeft size={16} />Kunci API</Link>
        <div className={classes.empty}><b>{detail.error}</b></div>
      </div>
    );
  }

  const items: SectionItem<Tab>[] = ready ? [
    { id: "overview", label: "Ringkasan", icon: IconLayoutDashboard, summary: revoked ? "Dicabut" : data.lastUsedAt ? `Dipakai ${fromNow(data.lastUsedAt)}` : "Belum pernah dipakai" },
    { id: "identity", label: "Identitas", icon: IconId, summary: name.trim() || "—", badge: nameChanged ? "diubah" : undefined },
    { id: "keywords", label: "Kata kunci", icon: IconTag, summary: scope.keywords.length ? scope.keywords.join(", ") : "Tidak dibatasi kata kunci", badge: keywordsChanged ? "diubah" : undefined },
    { id: "scope", label: "Cakupan data", icon: IconAdjustmentsHorizontal, summary: restrictions.length ? restrictions.join(" · ") : "Tanpa batasan", badge: paramsChanged ? "diubah" : undefined },
    { id: "ai", label: "Kategorisasi AI", icon: IconRobot, summary: aiStatus(data.classifier).text },
    { id: "security", label: "Keamanan", icon: IconShieldLock, summary: revoked ? "Kunci sudah dicabut" : "Salin, buat ulang, atau cabut" },
  ] : [];

  return (
    <div className={classes.page} data-dirty={(dirty && !revoked) || undefined}>
      <Link href="/api-keys" className={classes.back}><IconArrowLeft size={16} />Kunci API</Link>

      {!ready ? <Skeleton h={120} radius={22} /> : (
        <header className={classes.detailHero}>
          <div className={classes.heroGlow} aria-hidden />
          <span className={classes.heroIcon} data-live={(!revoked && !!data.lastUsedAt) || undefined}><IconPlugConnected size={22} /></span>
          <div className={classes.detailTitle}>
            <div className={classes.titleLine}>
              <h1>{data.name}</h1>
              <StatusPill tone={revoked ? "neutral" : "success"}>{revoked ? "Dicabut" : "Aktif"}</StatusPill>
            </div>
            <code>{data.prefix}••••••••</code>
            <ul className={classes.heroMeta}>
              <li><IconCalendar size={13} />Dibuat {formatDate(data.createdAt)}{data.createdBy && <> oleh <b>{data.createdBy}</b></>}</li>
              <li><IconClock size={13} />{data.lastUsedAt ? `Dipakai ${fromNow(data.lastUsedAt)}` : "Belum pernah dipakai"}</li>
              <li><IconRobot size={13} />AI {aiStatus(data.classifier).text.toLowerCase()}</li>
            </ul>
          </div>
          {!revoked && (
            <div className={classes.heroActions}>
              <Button onDark variant="secondary" icon={IconEye} href={`/media/${data.scope.types[0] ?? "social"}?key=${data.id}`}>Lihat data</Button>
              <CopyKeyButton keyId={data.id} copyable={data.copyable} size="md" onDark label="Salin kunci" />
            </div>
          )}
        </header>
      )}

      {ready && (
        <SectionLayout nav={<SectionNav items={items} active={tab} onSelect={setTab} />}>
          {tab === "overview" && (
            <SectionPanel icon={IconLayoutDashboard} title="Ringkasan" description={dirty ? "Pratinjau perubahan. Simpan untuk menerapkan cakupan ini ke aplikasi." : "Konfigurasi tersimpan yang berlaku untuk aplikasi."}>
              <div className={classes.tiles}>
                <button type="button" className={classes.tile} onClick={() => setTab("keywords")} disabled={revoked}>
                  <small><IconTag size={13} />Kata kunci</small>
                  {scope.keywords.length
                    ? <span className={classes.tileChips}>{scope.keywords.map((w) => <em key={w}>{w}</em>)}</span>
                    : <b>Tidak dibatasi kata kunci</b>}
                </button>
                <button type="button" className={classes.tile} onClick={() => setTab("scope")} disabled={revoked}>
                  <small><IconAdjustmentsHorizontal size={13} />Cakupan data</small>
                  <b>{scopeRestrictions(scope, provinceName).join(" · ") || "Tanpa batasan tambahan"}</b>
                </button>
                <button type="button" className={classes.tile} onClick={() => setTab("ai")}>
                  <small><IconRobot size={13} />Kategorisasi AI</small>
                  <b>{aiStatus(data.classifier).text}</b>
                  {data.classifier && <span>{data.classifier.providerName} · {data.classifier.model}</span>}
                </button>
                <div className={classes.tile}>
                  <small><IconClock size={13} />Terakhir dipakai</small>
                  <b>{data.lastUsedAt ? fromNow(data.lastUsedAt) : "Belum pernah"}</b>
                  {data.lastUsedAt && <span>{formatDate(data.lastUsedAt)}</span>}
                </div>
              </div>
              <p className={classes.stepHint}>Klik kotak kata kunci, cakupan, atau AI untuk mengubahnya.</p>
            </SectionPanel>
          )}

          {tab === "identity" && (
            <SectionPanel icon={IconId} title="Identitas" description="Nama tampilan kunci. Nilai kunci tidak berubah, jadi aplikasi tidak perlu diperbarui.">
              <TextInput classNames={keyInputClasses} label="Nama aplikasi" value={name} disabled={revoked || busy} maxLength={80} onChange={(e) => setName(e.currentTarget.value)} />
            </SectionPanel>
          )}

          {tab === "keywords" && (
            <SectionPanel icon={IconTag} title="Kata kunci" description="Aplikasi hanya menerima post dan berita yang menyebut salah satu kata kunci.">
              <fieldset disabled={revoked || busy} className={classes.fieldset}><KeywordsInput scope={scope} onChange={setScope} /></fieldset>
              {keywordsChanged && data.classifier && <div className={classes.warning}><IconAlertTriangle size={17} />Mengubah kata kunci akan mengulang kategorisasi AI dari awal.</div>}
            </SectionPanel>
          )}

          {tab === "scope" && (
            <SectionPanel icon={IconAdjustmentsHorizontal} title="Cakupan data" description="Batasan tetap yang dikunci di server. Aplikasi bisa menyaring lebih sempit, tapi tidak bisa melewatinya.">
              <fieldset disabled={revoked || busy} className={classes.fieldset}><ScopeParams bare scope={scope} onChange={setScope} /></fieldset>
              {paramsChanged && data.classifier && <div className={classes.warning}><IconAlertTriangle size={17} />Mengubah cakupan akan mengulang kategorisasi AI dari awal.</div>}
            </SectionPanel>
          )}

          {tab === "ai" && (
            <SectionPanel icon={IconRobot} title="Kategorisasi AI" description="Ringkasan kategorisasi dan saldo penyedia. Prompt dan kategori diatur di halaman pengaturan AI.">
              <AiOverview detail={data} />
            </SectionPanel>
          )}

          {tab === "security" && (
            <SectionPanel icon={IconShieldLock} title="Keamanan" description="Salin kunci untuk menghubungkan aplikasi, buat ulang jika bocor, atau cabut untuk menghentikan akses.">
              {revoked ? (
                <p className={classes.stepHint}>Kunci ini dicabut pada {formatDate(data.revokedAt!)}. Aplikasi yang memakainya mendapat 401.</p>
              ) : (
                <>
                <div className={classes.keyBox}>
                  <div>
                    <b>Nilai kunci</b>
                    <p>{data.copyable ? "Salin untuk dipasang di aplikasi. Perlakukan seperti kata sandi." : "Kunci ini dibuat sebelum penyimpanan terenkripsi, jadi nilainya tidak bisa disalin. Buat ulang kunci untuk mendapat nilai baru yang bisa disalin."}</p>
                  </div>
                  <CopyKeyButton keyId={data.id} copyable={data.copyable} size="md" onDark label="Salin kunci" />
                </div>
                <div className={classes.keyBox}>
                  <div>
                    <b>Buat ulang kunci</b>
                    <p>Membuat nilai kunci baru. Nilai lama langsung tidak berlaku, jadi aplikasi harus diperbarui. Nama, cakupan, dan hasil kategorisasi AI tetap.</p>
                  </div>
                  <Button onDark variant="secondary" icon={IconRefresh} disabled={dirty || busy} title={dirty ? "Simpan atau batalkan perubahan sebelum membuat ulang kunci" : undefined} onClick={() => setConfirmRotate(true)}>Buat ulang kunci</Button>
                </div>
                <div className={classes.dangerBox}>
                  <div><b>Cabut kunci</b><p>Aplikasi yang memakai kunci ini langsung kehilangan akses. Tidak bisa dibatalkan; buat kunci baru bila perlu.</p></div>
                  <Button variant="danger" icon={IconShieldOff} disabled={busy} onClick={() => setConfirmRevoke(true)}>Cabut kunci</Button>
                </div>
                </>
              )}
            </SectionPanel>
          )}
        </SectionLayout>
      )}

      {/* Changes can span several tabs, so saving lives in one bar that follows the page. */}
      <div className={classes.saveBar} data-visible={(dirty && !revoked) || undefined} aria-hidden={!dirty || revoked} inert={!dirty || revoked}>
        <span role="status"><IconAlertTriangle size={16} />Ada perubahan yang belum disimpan</span>
        <Button onDark variant="secondary" onClick={reset} disabled={busy}>Batalkan</Button>
        <Button variant="primary" icon={IconDeviceFloppy} onClick={save} loading={busy}>{busy ? "Menyimpan…" : "Simpan perubahan"}</Button>
      </div>

      <RestartConfirm request={restart} onClose={() => setRestart(null)} loading={busy} />

      <Modal aria-label={rotated ? "Kunci baru" : "Konfirmasi buat ulang kunci"} opened={confirmRotate || !!rotated} onClose={() => { setConfirmRotate(false); setRotated(null); }} centered size={rotated ? "lg" : "md"} radius={20} padding={0}
        withCloseButton={false} overlayProps={{ backgroundOpacity: 0.55, blur: 6 }} transitionProps={{ transition: "pop", duration: 200 }}>
        {rotated ? (
          <div className={classes.confirm}>
            <span className={classes.confirmIcon} data-tone="success"><IconRefresh size={22} /></span>
            <b>Kunci baru untuk &ldquo;{data?.name}&rdquo;</b>
            <p>Nilai lama sudah tidak berlaku. Pasang nilai ini di aplikasi; nilai ini tetap bisa disalin lagi dari halaman ini.</p>
            <div className={classes.secret}><code>{rotated}</code>
              <CopyButton value={rotated}>{({ copied, copy }) => <Button variant="primary" icon={copied ? IconCheck : IconCopy} onClick={copy}>{copied ? "Tersalin" : "Salin"}</Button>}</CopyButton>
            </div>
            <div className={classes.confirmActions}><Button variant="secondary" block onClick={() => setRotated(null)}>Selesai</Button></div>
          </div>
        ) : (
          <div className={classes.confirm}>
            <span className={classes.confirmIcon} data-tone="warning"><IconRefresh size={22} /></span>
            <b>Buat ulang kunci &ldquo;{data?.name}&rdquo;?</b>
            <p>Nilai kunci yang sekarang langsung berhenti berlaku. Aplikasi yang memakainya mendapat 401 sampai diperbarui dengan nilai baru.</p>
            <div className={classes.confirmActions}>
              <Button variant="secondary" block onClick={() => setConfirmRotate(false)}>Batal</Button>
              <Button variant="primary" block icon={IconRefresh} onClick={rotate} loading={busy}>{busy ? "Membuat…" : "Buat ulang"}</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal aria-label="Konfirmasi cabut kunci" opened={confirmRevoke} onClose={() => setConfirmRevoke(false)} centered radius={20} padding={0} withCloseButton={false}
        overlayProps={{ backgroundOpacity: 0.55, blur: 6 }} transitionProps={{ transition: "pop", duration: 200 }}>
        <div className={classes.confirm}>
          <span className={classes.confirmIcon}><IconShieldOff size={22} /></span>
          <b>Cabut kunci &ldquo;{data?.name}&rdquo;?</b>
          <p>Aplikasi yang memakai kunci ini langsung tidak bisa mengakses data. Tindakan ini tidak bisa dibatalkan.</p>
          <div className={classes.confirmActions}>
            <Button variant="secondary" block onClick={() => setConfirmRevoke(false)}>Batal</Button>
            <Button variant="danger" block icon={IconShieldOff} onClick={revoke} loading={busy}>{busy ? "Mencabut…" : "Cabut kunci"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
