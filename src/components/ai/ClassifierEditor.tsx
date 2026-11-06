"use client";
// Editor for a key's AI categorisation: its own AI provider and key, prompt, categories.
// Used on the create-key wizard and on a key's AI settings page.
import { useState } from "react";
import { PasswordInput, Textarea, TextInput } from "@mantine/core";
import { IconCheck, IconPlayerPlay, IconPlus, IconRobot, IconShieldLock, IconSparkles, IconTrash, IconX } from "@tabler/icons-react";
import { post } from "@/lib/api-client";
import { PROVIDER_PRESETS, QUICK_WIN_PRESET, type Category, type ProviderKind } from "@/lib/ai/classifier";
import { Button } from "../ui/Button";
import classes from "./ai.module.css";

export type ProviderDraft = { kind: ProviderKind; baseUrl: string; model: string; apiKey: string };
export type ClassifierDraft = { provider: ProviderDraft; enabled: boolean; prompt: string; categories: Category[] };
type TestResult = { ok: boolean; ms: number; error?: string; results?: { text: string; category?: string; reason?: string | null }[] };

const providerFromPreset = (id: string): ProviderDraft => {
  const p = PROVIDER_PRESETS.find((x) => x.id === id) ?? PROVIDER_PRESETS[0];
  return { kind: p.kind, baseUrl: p.baseUrl, model: p.model, apiKey: "" };
};
const presetOf = (provider: ProviderDraft) =>
  provider.kind === "anthropic" ? "claude" : PROVIDER_PRESETS.find((p) => p.baseUrl && p.baseUrl === provider.baseUrl.replace(/\/+$/, ""))?.id ?? "custom";

export const emptyDraft = (): ClassifierDraft => ({ provider: providerFromPreset("claude"), enabled: true, prompt: "", categories: [] });

/** Rough checks shown before saving; the server validates again. `hasStoredKey`: an empty API key keeps the saved one. */
export function draftProblems(draft: ClassifierDraft, hasStoredKey = false) {
  const problems: string[] = [];
  if (!draft.provider.apiKey.trim() && !hasStoredKey) problems.push("Isi API key penyedia AI");
  if (draft.provider.model.trim().length < 2) problems.push("Isi model AI");
  if (draft.provider.kind === "openai_compatible" && !/^https?:\/\//.test(draft.provider.baseUrl.trim())) problems.push("Isi base URL penyedia AI");
  if (draft.prompt.trim().length < 10) problems.push("Prompt minimal 10 karakter");
  if (draft.categories.length < 2) problems.push("Minimal 2 kategori");
  const codes = draft.categories.map((c) => c.code.trim().toUpperCase());
  if (codes.some((c) => !/^[A-Z0-9_-]{1,20}$/.test(c))) problems.push("Kode kategori hanya huruf, angka, - atau _");
  if (new Set(codes).size !== codes.length) problems.push("Kode kategori harus unik");
  if (draft.categories.some((c) => c.label.trim().length < 2)) problems.push("Setiap kategori perlu nama");
  return problems;
}

/** Provider, model, endpoint and API key of one key's categorisation, with a connection test. */
function ProviderFields({ provider, onChange, storedKeyHint, apiKeyId }: {
  provider: ProviderDraft; onChange: (p: ProviderDraft) => void; storedKeyHint?: string | null; apiKeyId?: string | null;
}) {
  const [test, setTest] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const inputClasses = { input: classes.input, label: classes.label, description: classes.description, innerInput: classes.innerInput };
  const preset = presetOf(provider);

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      setTest(await post("/api/admin/ai-test", { provider, apiKeyId: apiKeyId ?? null }) as TestResult);
    } catch (err) {
      setTest({ ok: false, ms: 0, error: (err as Error).message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className={classes.provider}>
      <div className={classes.providerHead}><IconRobot size={15} />Penyedia AI<small>Khusus kunci ini · API key disimpan terenkripsi</small></div>
      <div className={classes.presets}>
        {PROVIDER_PRESETS.map((p) => (
          <button key={p.id} type="button" data-active={preset === p.id || undefined}
            onClick={() => { onChange({ ...providerFromPreset(p.id), apiKey: provider.apiKey }); setTest(null); }}>{p.label}</button>
        ))}
      </div>
      <div className={classes.row}>
        <TextInput classNames={inputClasses} label="Model" value={provider.model} onChange={(e) => onChange({ ...provider, model: e.currentTarget.value })}
          description={provider.kind === "anthropic" ? "mis. claude-opus-5-5, claude-sonnet-5-5, claude-haiku-5-5" : "Nama model sesuai dokumentasi penyedia"} />
        {provider.kind === "openai_compatible"
          ? <TextInput classNames={inputClasses} label="Base URL" placeholder="https://api.deepseek.com" value={provider.baseUrl}
              onChange={(e) => onChange({ ...provider, baseUrl: e.currentTarget.value })} description="Endpoint yang menyediakan /chat/completions" />
          : <div />}
      </div>
      <PasswordInput classNames={inputClasses} label="API key penyedia AI" value={provider.apiKey} onChange={(e) => onChange({ ...provider, apiKey: e.currentTarget.value })}
        placeholder={storedKeyHint ? `Tersimpan ••••${storedKeyHint} — kosongkan bila tidak diganti` : "Tempel API key"}
        leftSection={<IconShieldLock size={15} />} autoComplete="off" />
      <div className={classes.testRow}>
        <Button size="sm" onDark variant="secondary" icon={IconPlayerPlay} onClick={runTest} loading={testing}>{testing ? "Menguji…" : "Uji koneksi"}</Button>
        {test && (
          <span className={classes.testResult} data-ok={test.ok || undefined}>
            {test.ok ? <><IconCheck size={14} />Terhubung · {(test.ms / 1000).toFixed(1)} detik · contoh: {test.results?.map((r) => r.category ?? "—").join(", ")}</> : <><IconX size={14} />{test.error}</>}
          </span>
        )}
      </div>
    </div>
  );
}

export function ClassifierEditor({ draft, onChange, storedKeyHint, apiKeyId }: {
  draft: ClassifierDraft;
  onChange: (draft: ClassifierDraft) => void;
  /** Last four characters of the saved provider key, when editing. */
  storedKeyHint?: string | null;
  /** The Signalbase API key being edited, so the connection test can use its saved provider key. */
  apiKeyId?: string | null;
}) {
  const update = (patch: Partial<ClassifierDraft>) => onChange({ ...draft, ...patch });
  const setCategory = (index: number, patch: Partial<Category>) =>
    update({ categories: draft.categories.map((c, i) => (i === index ? { ...c, ...patch } : c)) });
  const inputClasses = { input: classes.input, label: classes.label, description: classes.description };

  return (
    <div className={classes.editor}>
      <ProviderFields provider={draft.provider} onChange={(provider) => update({ provider })} storedKeyHint={storedKeyHint} apiKeyId={apiKeyId} />


      <div className={classes.presetBar}>
        <span><IconSparkles size={14} />Mulai dari preset</span>
        <button type="button" onClick={() => update({ prompt: QUICK_WIN_PRESET.prompt, categories: QUICK_WIN_PRESET.categories.map((c) => ({ ...c })) })}>
          8 Quick Win Kapolri
        </button>
      </div>

      <Textarea classNames={inputClasses} label="Prompt" description="Instruksi untuk AI. Daftar kategori dan format jawaban ditambahkan otomatis."
        autosize minRows={4} maxRows={12} value={draft.prompt} onChange={(e) => update({ prompt: e.currentTarget.value })}
        placeholder="mis. Klasifikasikan post tentang kepolisian ke dalam program prioritas berikut…" />

      <div className={classes.categories}>
        <div className={classes.categoriesHead}>
          <span>Kategori <b>{draft.categories.length}</b></span>
          <small>Satu item mendapat satu kategori, atau &ldquo;none&rdquo; bila tidak cocok.</small>
        </div>
        {draft.categories.map((category, index) => (
          <div key={index} className={classes.category}>
            <TextInput classNames={{ input: classes.input }} aria-label="Kode" placeholder="QW1" value={category.code}
              onChange={(e) => setCategory(index, { code: e.currentTarget.value.toUpperCase() })} className={classes.code} />
            <div className={classes.categoryBody}>
              <TextInput classNames={{ input: classes.input }} aria-label="Nama kategori" placeholder="Nama kategori" value={category.label}
                onChange={(e) => setCategory(index, { label: e.currentTarget.value })} />
              <Textarea classNames={{ input: classes.input }} aria-label="Deskripsi" placeholder="Apa saja yang termasuk kategori ini (membantu AI)"
                autosize minRows={1} maxRows={4} value={category.description} onChange={(e) => setCategory(index, { description: e.currentTarget.value })} />
            </div>
            <button type="button" className={classes.remove} aria-label="Hapus kategori"
              onClick={() => update({ categories: draft.categories.filter((_, i) => i !== index) })}><IconTrash size={16} /></button>
          </div>
        ))}
        <button type="button" className={classes.add} disabled={draft.categories.length >= 30}
          onClick={() => update({ categories: [...draft.categories, { code: `K${draft.categories.length + 1}`, label: "", description: "" }] })}>
          <IconPlus size={15} />Tambah kategori
        </button>
      </div>

      <p className={classes.hint}>
        Semua data dalam cakupan kunci akan dikategorikan, mulai dari yang terbaru lalu mundur ke data lama, sekitar 100 item per menit.
        Mengubah prompt, kategori, penyedia, atau model akan mengulang kategorisasi dari awal; mengganti API key saja tidak.
      </p>
    </div>
  );
}
