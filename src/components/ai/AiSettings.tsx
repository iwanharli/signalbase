"use client";
import { useState } from "react";
import { Modal, PasswordInput, Skeleton, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconPencil, IconPlayerPlay, IconPlus, IconRobot, IconShieldLock, IconTrash, IconX } from "@tabler/icons-react";
import { api, post } from "@/lib/api-client";
import { PROVIDER_PRESETS, type ProviderKind } from "@/lib/ai/classifier";
import { useApi } from "@/lib/useApi";
import classes from "./aiSettings.module.css";

type Provider = { id: string; name: string; kind: ProviderKind; baseUrl: string | null; model: string; apiKeyHint: string; usedBy: number };
type Form = { id?: string; preset: string; name: string; kind: ProviderKind; baseUrl: string; model: string; apiKey: string; apiKeyHint?: string };
type TestResult = { ok: boolean; ms: number; error?: string; results?: { text: string; category?: string; confidence?: number | null; reason?: string | null }[] };

const KIND_LABEL: Record<ProviderKind, string> = { anthropic: "Claude", openai_compatible: "Kompatibel OpenAI" };

const formFromPreset = (presetId: string): Form => {
  const preset = PROVIDER_PRESETS.find((p) => p.id === presetId) ?? PROVIDER_PRESETS[0];
  return { preset: preset.id, name: preset.id === "custom" ? "" : preset.label, kind: preset.kind, baseUrl: preset.baseUrl, model: preset.model, apiKey: "" };
};

function ProviderForm({ initial, onClose, onSaved }: { initial: Form; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const editing = !!initial.id;
  const update = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { name: form.name, kind: form.kind, baseUrl: form.kind === "openai_compatible" ? form.baseUrl : "", model: form.model, apiKey: form.apiKey };
      await post(editing ? `/api/admin/ai-providers/${initial.id}` : "/api/admin/ai-providers", body, editing ? "PATCH" : "POST");
      notifications.show({ color: "teal", message: editing ? "Penyedia diperbarui" : "Penyedia ditambahkan" });
      onSaved();
    } catch (err) {
      notifications.show({ color: "red", message: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const inputClasses = { input: classes.input, label: classes.label, description: classes.description };
  return (
    <form className={classes.form} onSubmit={submit}>
      <header className={classes.formHead}>
        <span className={classes.icon}><IconRobot size={18} /></span>
        <div><b>{editing ? "Ubah penyedia" : "Tambah penyedia AI"}</b><small>API key disimpan terenkripsi dan tidak pernah ditampilkan lagi.</small></div>
        <button type="button" className={classes.close} onClick={onClose} aria-label="Tutup"><IconX size={18} /></button>
      </header>

      {!editing && (
        <div className={classes.presets}>
          {PROVIDER_PRESETS.map((p) => (
            <button key={p.id} type="button" data-active={form.preset === p.id || undefined} onClick={() => setForm({ ...formFromPreset(p.id), apiKey: form.apiKey })}>{p.label}</button>
          ))}
        </div>
      )}

      <div className={classes.grid}>
        <TextInput classNames={inputClasses} label="Nama" placeholder="mis. Claude produksi" required value={form.name} onChange={(e) => update({ name: e.currentTarget.value })} />
        <TextInput classNames={inputClasses} label="Model" required value={form.model} onChange={(e) => update({ model: e.currentTarget.value })}
          description={form.kind === "anthropic" ? "mis. claude-opus-5-5, claude-sonnet-5-5, claude-haiku-5-5" : "Nama model sesuai dokumentasi penyedia"} />
        {form.kind === "openai_compatible" && (
          <TextInput classNames={inputClasses} label="Base URL" required placeholder="https://api.deepseek.com" value={form.baseUrl}
            onChange={(e) => update({ baseUrl: e.currentTarget.value })} description="Endpoint yang menyediakan /chat/completions" className={classes.wide} />
        )}
        <PasswordInput classNames={{ ...inputClasses, innerInput: classes.innerInput }} label="API key" required={!editing} className={classes.wide}
          placeholder={editing ? `Tersimpan ••••${initial.apiKeyHint ?? ""} — kosongkan bila tidak diganti` : "Tempel API key"} value={form.apiKey}
          onChange={(e) => update({ apiKey: e.currentTarget.value })} />
      </div>

      <footer className={classes.formFoot}>
        <button type="button" className={classes.ghost} onClick={onClose}>Batal</button>
        <button type="submit" className={classes.primary} disabled={busy}>{busy ? "Menyimpan…" : editing ? "Simpan perubahan" : "Tambah penyedia"}</button>
      </footer>
    </form>
  );
}

function ProviderCard({ provider, onEdit, onDeleted }: { provider: Provider; onEdit: () => void; onDeleted: () => void }) {
  const [test, setTest] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      setTest(await post(`/api/admin/ai-providers/${provider.id}/test`, {}) as TestResult);
    } catch (err) {
      setTest({ ok: false, ms: 0, error: (err as Error).message });
    } finally {
      setTesting(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Hapus penyedia "${provider.name}"?`)) return;
    try {
      await api(`/api/admin/ai-providers/${provider.id}`, { method: "DELETE" });
      onDeleted();
    } catch (err) {
      notifications.show({ color: "red", message: (err as Error).message });
    }
  };

  return (
    <article className={classes.card}>
      <header className={classes.cardHead}>
        <span className={classes.icon} data-kind={provider.kind}><IconRobot size={18} /></span>
        <div className={classes.cardTitle}><b>{provider.name}</b><code>{provider.model}</code></div>
        <span className={classes.kind}>{KIND_LABEL[provider.kind]}</span>
      </header>
      <dl className={classes.meta}>
        {provider.baseUrl && <div><dt>Base URL</dt><dd>{provider.baseUrl}</dd></div>}
        <div><dt>API key</dt><dd><IconShieldLock size={13} />••••{provider.apiKeyHint}</dd></div>
        <div><dt>Dipakai</dt><dd>{provider.usedBy ? `${provider.usedBy} kunci API` : "Belum dipakai"}</dd></div>
      </dl>

      {test && (
        <div className={classes.test} data-ok={test.ok || undefined}>
          {test.ok ? (
            <>
              <b><IconCheck size={15} />Terhubung · {(test.ms / 1000).toFixed(1)} detik</b>
              {test.results?.map((r, i) => (
                <p key={i}><span>{r.category ?? "—"}</span>{r.text.slice(0, 70)}…{r.reason ? <em> — {r.reason}</em> : null}</p>
              ))}
            </>
          ) : <b><IconX size={15} />{test.error}</b>}
        </div>
      )}

      <footer className={classes.cardFoot}>
        <button type="button" className={classes.action} onClick={runTest} disabled={testing}><IconPlayerPlay size={14} />{testing ? "Menguji…" : "Uji koneksi"}</button>
        <button type="button" className={classes.action} onClick={onEdit}><IconPencil size={14} />Ubah</button>
        <button type="button" className={classes.action} data-danger onClick={remove} disabled={provider.usedBy > 0}
          title={provider.usedBy ? "Masih dipakai kunci API" : undefined}><IconTrash size={14} />Hapus</button>
      </footer>
    </article>
  );
}

/** /settings/ai — connect AI providers used for categorisation. */
export function AiSettings() {
  const providers = useApi<Provider[]>("/api/admin/ai-providers");
  const [form, setForm] = useState<Form | null>(null);

  const edit = (p: Provider) => setForm({ id: p.id, preset: "", name: p.name, kind: p.kind, baseUrl: p.baseUrl ?? "", model: p.model, apiKey: "", apiKeyHint: p.apiKeyHint });

  return (
    <div className={classes.page}>
      <header className={classes.hero}>
        <div className={classes.heroGrid} aria-hidden />
        <div className={classes.heroText}>
          <span className={classes.badge}><IconRobot size={13} />Kategorisasi AI</span>
          <h1>Pengaturan <em>AI</em></h1>
          <p>Hubungkan Claude, DeepSeek, OpenAI, atau penyedia lain yang kompatibel OpenAI. Penyedia ini dipakai untuk mengkategorikan media sosial dan media online per kunci API.</p>
        </div>
        <button type="button" className={classes.primary} onClick={() => setForm(formFromPreset("claude"))}><IconPlus size={16} />Tambah penyedia</button>
      </header>

      {!providers.data ? (
        <div className={classes.cards}>{[0, 1].map((i) => <Skeleton key={i} h={190} radius={20} />)}</div>
      ) : providers.data.length ? (
        <div className={classes.cards}>
          {providers.data.map((p) => <ProviderCard key={p.id} provider={p} onEdit={() => edit(p)} onDeleted={providers.reload} />)}
        </div>
      ) : (
        <div className={classes.empty}>
          <IconRobot size={28} /><b>Belum ada penyedia AI</b><span>Tambahkan satu untuk mulai mengkategorikan data per kunci API.</span>
          <button type="button" className={classes.primary} onClick={() => setForm(formFromPreset("claude"))}><IconPlus size={16} />Tambah penyedia</button>
        </div>
      )}

      <Modal opened={!!form} onClose={() => setForm(null)} centered size="lg" radius={22} padding={0} withCloseButton={false}
        overlayProps={{ backgroundOpacity: 0.55, blur: 6 }} transitionProps={{ transition: "pop", duration: 220 }} classNames={{ content: classes.modal }}>
        {form && <ProviderForm key={form.id ?? "new"} initial={form}
          onClose={() => setForm(null)} onSaved={() => { setForm(null); providers.reload(); }} />}
      </Modal>
    </div>
  );
}
