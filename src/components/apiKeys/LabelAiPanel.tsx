"use client";
// /project/[id]/labels — AI settings of "Kustomisasi Label": Grok or DeepSeek choosing among the project's labels.
// shortcut: only "Uji koneksi" works (the key is sent for that test and never stored; nothing is saved and no AI labels anything),
// until the settings API and the worker exist.
import { useState } from "react";
import Link from "next/link";
import { PasswordInput, Skeleton, Switch, Textarea, TextInput } from "@mantine/core";
import { IconArrowLeft, IconCheck, IconX, IconDeviceFloppy, IconPlayerPlay, IconRefresh, IconRobot, IconShieldLock, IconTags } from "@tabler/icons-react";
import { defaultLabelPrompt, type LabelSettings } from "@/lib/media/manualLabels";
import { useApi } from "@/lib/useApi";
import { post } from "@/lib/api-client";
import { apiKeyProblem, XAI_BASE_URL } from "@/lib/ai/classifier";
import { daysAgo, RangeField } from "../ai/ClassifierEditor";
import { Button } from "../ui/Button";
import ai from "../ai/ai.module.css";
import card from "../ai/keyClassifier.module.css";

export function LabelAiSettings({ keyId }: { keyId: string }) {
  const settings = useApi<LabelSettings>(`/api/admin/keys/${keyId}/labels`);
  const project = useApi<{ key: { name: string } }>(`/api/admin/keys/${keyId}/classifier`);
  const back = `/project/${keyId}?tab=labels`;
  const name = project.data?.key.name;

  return (
    <div className={card.page}>
      <Link href={back} className={card.back}><IconArrowLeft size={16} />{name ?? "Detail proyek"}</Link>
      <header className={card.title}>
        <span className={card.icon}><IconTags size={22} /></span>
        <div>
          <h1>Pengaturan AI label {name && <em>· {name}</em>}</h1>
          <p>AI memilih label proyek ini untuk setiap post dan berita.</p>
        </div>
      </header>
      {!settings.data ? (settings.error ? <p role="alert">{settings.error}</p> : <Skeleton h={320} radius="lg" />)
        : settings.data.canEdit ? <LabelAiPanel labels={settings.data.options} />
        : <p>Hanya pemilik proyek atau admin yang dapat mengatur AI label.</p>}
    </div>
  );
}

type TestResult = { ok: boolean; ms: number; error?: string };

/** The providers offered for AI labels, the first one preselected; both speak the OpenAI API and have a fixed address. */
const PROVIDERS = [
  { id: "deepseek", label: "DeepSeek", vendor: "DeepSeek", baseUrl: "https://api.deepseek.com", model: "deepseek-flash" },
  { id: "grok", label: "Grok (xAI)", vendor: "xAI", baseUrl: XAI_BASE_URL, model: "grok-4.7" },
] as const;

function LabelAiPanel({ labels }: { labels: string[] }) {
  // null: not edited, so the instruction follows the saved labels.
  const [edited, setEdited] = useState<string | null>(null);
  const [provider, setProvider] = useState<(typeof PROVIDERS)[number]>(PROVIDERS[0]);
  const [model, setModel] = useState<string>(PROVIDERS[0].model);
  const [apiKey, setApiKey] = useState("");
  const [test, setTest] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const keyProblem = apiKey ? apiKeyProblem("openai_compatible", provider.baseUrl, apiKey) : null;
  const pickProvider = (next: (typeof PROVIDERS)[number]) => {
    if (next.id === provider.id) return;
    // The typed key belongs to the previous provider, so it must not be sent to the next one.
    setProvider(next); setModel(next.model); setApiKey(""); setTest(null);
  };
  const runTest = async () => {
    setTest(null);
    setTesting(true);
    try {
      // apiKeyId stays null: the server must never fall back to the categorisation key, which belongs to another provider.
      setTest(await post("/api/admin/ai-test", { provider: { kind: "openai_compatible", baseUrl: provider.baseUrl, model, apiKey }, apiKeyId: null }) as TestResult);
    } catch (err) {
      setTest({ ok: false, ms: 0, error: (err as Error).message });
    } finally {
      setTesting(false);
    }
  };
  const [enabled, setEnabled] = useState(false);
  const [startFrom, setStartFrom] = useState<string | null>(() => daysAgo(7));
  const [labelledOnly, setLabelledOnly] = useState(false);
  const inputs = { input: ai.input, label: ai.label, description: ai.description };
  const switches = { label: ai.switchLabel, description: ai.switchDescription };

  return (
    <section className={card.editorCard}>
      <div className={ai.editor}>
        <p className={ai.platformNote} role="note">
          <IconRobot size={15} />Pelabelan otomatis dengan AI <b>segera hadir</b>. Yang sudah berfungsi baru <b>Uji koneksi</b>: isian belum disimpan dan belum ada post yang dilabeli AI.
        </p>

        <div className={ai.provider}>
          <div className={ai.providerHead}><IconRobot size={15} />Penyedia AI<small>DeepSeek atau Grok · khusus proyek ini</small></div>
          <div className={ai.presets}>
            {PROVIDERS.map((p) => (
              <button key={p.id} type="button" disabled={testing} aria-pressed={p.id === provider.id} data-active={p.id === provider.id || undefined} onClick={() => pickProvider(p)}>{p.label}</button>
            ))}
          </div>
          <div className={ai.row}>
            <TextInput classNames={inputs} label="Model" value={model} disabled={testing} onChange={(e) => { setModel(e.currentTarget.value); setTest(null); }} placeholder={provider.model} description={`Nama model sesuai dokumentasi ${provider.vendor}`} />
            <TextInput classNames={inputs} label="Base URL" value={provider.baseUrl} readOnly description="Terkunci" />
          </div>
          <PasswordInput classNames={{ ...inputs, innerInput: ai.innerInput }} label="API key penyedia AI" value={apiKey} disabled={testing}
            onChange={(e) => { setApiKey(e.currentTarget.value); setTest(null); }} placeholder={`Tempel API key ${provider.vendor}`}
            description="Dipakai untuk Uji koneksi saja, belum disimpan." leftSection={<IconShieldLock size={15} />} error={keyProblem}
            // Not a login field: stop browsers and password managers from filling in the admin password.
            autoComplete="new-password" name="ai-label-api-key" data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other" />
          <div className={ai.testRow}>
            <Button size="sm" onDark variant="secondary" icon={IconPlayerPlay} onClick={runTest} loading={testing}
              disabled={!apiKey || !!keyProblem || model.trim().length < 2}>{testing ? "Menguji…" : "Uji koneksi"}</Button>
            {test && (
              <span className={ai.testResult} data-ok={test.ok || undefined} role="status">
                {test.ok ? <><IconCheck size={14} />Terhubung · {(test.ms / 1000).toFixed(1)} detik · model menjawab JSON</> : <><IconX size={14} />{test.error}</>}
              </span>
            )}
          </div>
        </div>

        <div className={ai.provider}>
          <div className={ai.providerHead}><IconTags size={15} />Prompt<small>Panduan untuk AI saat memilih label</small></div>
          <Textarea classNames={inputs} label="Instruksi untuk AI" autosize minRows={3} value={edited ?? defaultLabelPrompt(labels)} onChange={(e) => setEdited(e.currentTarget.value)}
            description={edited === null ? "Disusun otomatis dari pilihan label proyek ini. Bisa diedit." : "Sudah diedit; tidak lagi mengikuti perubahan daftar label."}
            placeholder="Tambahkan pilihan label untuk menyusun instruksi bawaan." />
          {edited !== null && (
            <div className={ai.testRow}><Button size="sm" onDark variant="secondary" icon={IconRefresh} onClick={() => setEdited(null)}>Buat ulang dari label</Button></div>
          )}
        </div>

        <div className={ai.sameToggle}>
          <Switch checked={enabled} onChange={(e) => setEnabled(e.currentTarget.checked)} color="violet" size="md" label="Aktifkan pelabelan AI"
            description={enabled ? "AI akan memilih label untuk post dalam rentang data di bawah." : "Dijeda: AI tidak melabeli post."} classNames={switches} />
        </div>

        <RangeField value={startFrom} onChange={setStartFrom} defaultChoice="7" />

        <div className={ai.sameToggle}>
          <Switch checked={labelledOnly} onChange={(e) => setLabelledOnly(e.currentTarget.checked)} color="violet" size="md" label="Tampilkan hanya yang sudah diberi label"
            description={labelledOnly
              ? "Hanya post yang punya label yang ditampilkan, di panel proyek ini dan API."
              : "Semua post dalam cakupan ditampilkan, berlabel maupun belum."} classNames={switches} />
        </div>

        <div className={ai.testRow}><Button size="sm" variant="primary" icon={IconDeviceFloppy} disabled>Simpan pengaturan AI</Button></div>
      </div>
    </section>
  );
}
