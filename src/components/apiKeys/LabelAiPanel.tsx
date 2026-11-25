"use client";
// /project/[id]/labels — AI settings of "Kustomisasi Label", saved per project.
// The label worker (npm run label-ai) does the labelling; progress is as of page load.
import { useState } from "react";
import Link from "next/link";
import { NumberInput, PasswordInput, Skeleton, Switch, Textarea, TextInput } from "@mantine/core";
import { IconArrowLeft, IconCheck, IconX, IconDeviceFloppy, IconPlayerPlay, IconRefresh, IconRobot, IconShieldLock, IconTags } from "@tabler/icons-react";
import { defaultLabelPrompt, syncLabelList, type LabelSettings } from "@/lib/media/manualLabels";
import { useApi } from "@/lib/useApi";
import { notifications } from "@mantine/notifications";
import { post } from "@/lib/api-client";
import { apiKeyProblem } from "@/lib/ai/classifier";
import { LABEL_AI_PROVIDERS, labelAiProvider, type LabelAiProgress, type LabelAiSaved, type LabelAiState } from "@/lib/ai/labelAi";
import { daysAgo, RangeField } from "../ai/ClassifierEditor";
import { Button } from "../ui/Button";
import ai from "../ai/ai.module.css";
import card from "../ai/keyClassifier.module.css";

export function LabelAiSettings({ keyId }: { keyId: string }) {
  const settings = useApi<LabelSettings>(`/api/admin/keys/${keyId}/labels`);
  const project = useApi<{ key: { name: string } }>(`/api/admin/keys/${keyId}/classifier`);
  // Only asked for when this account may change them; the server refuses everyone else.
  const stored = useApi<LabelAiState>(settings.data?.canEdit ? `/api/admin/keys/${keyId}/label-ai` : null);
  const loadError = settings.error ?? stored.error;
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
      {loadError ? <p role="alert">{loadError}</p>
        : settings.data && !settings.data.canEdit ? <p>Hanya pemilik proyek atau admin yang dapat mengatur AI label.</p>
        : settings.data && stored.data ? <LabelAiPanel key={keyId} keyId={keyId} labels={settings.data.options} initial={stored.data.saved} progress={stored.data.progress ?? null} />
        : <Skeleton h={320} radius="lg" />}
    </div>
  );
}

type TestResult = { ok: boolean; ms: number; error?: string };

function LabelAiPanel({ keyId, labels, initial, progress }: { keyId: string; labels: string[]; initial: LabelAiSaved | null; progress: LabelAiProgress | null }) {
  const [enabled, setEnabled] = useState(initial?.enabled ?? false);
  const [dailyLimit, setDailyLimit] = useState(initial?.dailyLimit ?? 500);
  const [openedAt] = useState(() => Date.now());
  const [saved, setSaved] = useState(initial);
  // null: not edited, so the whole instruction follows the saved labels. An edited one gets its label list updated on load
  // (not while typing, which would rewrite lines under the cursor).
  const [edited, setEdited] = useState<string | null>(() => (initial?.prompt == null ? null : syncLabelList(initial.prompt, labels)));
  const [provider, setProvider] = useState<(typeof LABEL_AI_PROVIDERS)[number]>(() => {
    const stored = labelAiProvider(initial?.provider ?? "");
    return stored.webSearch ? stored : LABEL_AI_PROVIDERS[0];
  });
  const [model, setModel] = useState<string>(initial && initial.provider === provider.id ? initial.model : provider.model);
  const [apiKey, setApiKey] = useState("");
  const [test, setTest] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [startFrom, setStartFrom] = useState<string | null>(() => (initial ? initial.startFrom : daysAgo(7)));
  const keyProblem = apiKey ? apiKeyProblem("openai_compatible", provider.baseUrl, apiKey) : null;
  // A stored key counts only for the provider it was entered for.
  const storedHint = saved?.provider === provider.id ? saved.apiKeyHint : null;
  const ready = (!!apiKey || !!storedHint) && !keyProblem && model.trim().length >= 2;
  const busy = testing || saving;

  const pickProvider = (next: (typeof LABEL_AI_PROVIDERS)[number]) => {
    if (next.id === provider.id) return;
    // The typed key belongs to the previous provider, so it must not be sent to the next one.
    setProvider(next); setModel(saved?.provider === next.id ? saved.model : next.model); setApiKey(""); setTest(null);
  };
  const runTest = async () => {
    setTest(null);
    setTesting(true);
    try {
      setTest(await post(`/api/admin/keys/${keyId}/label-ai/test`, { provider: provider.id, model, apiKey }) as TestResult);
    } catch (err) {
      setTest({ ok: false, ms: 0, error: (err as Error).message });
    } finally {
      setTesting(false);
    }
  };
  const save = async () => {
    setSaving(true);
    try {
      const next = (await post(`/api/admin/keys/${keyId}/label-ai`, { provider: provider.id, model, apiKey, prompt: edited, startFrom, enabled, dailyLimit }, "PUT") as LabelAiState).saved!;
      setSaved(next); setEnabled(next.enabled); setDailyLimit(next.dailyLimit); setModel(next.model); setEdited(next.prompt); setApiKey("");
      notifications.show({ color: "teal", message: "Pengaturan AI label disimpan" });
    } catch (err) {
      notifications.show({ color: "red", message: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };
  const inputs = { input: ai.input, label: ai.label, description: ai.description };
  const switches = { label: ai.switchLabel, description: ai.switchDescription };

  return (
    <section className={card.editorCard}>
      <div className={ai.editor}>
        <p className={ai.platformNote} role="note">
          <IconRobot size={15} />Saat aktif, AI memberi label otomatis dan <b>memakai kredit API key Anda</b>. Setiap post yang mendapat label <b>selalu dicari sumbernya di internet</b> (satu panggilan tambahan per post). Hasilnya dugaan yang perlu diperiksa; post yang labelnya sudah diubah orang tidak disentuh AI.
        </p>

        <div className={ai.provider}>
          <div className={ai.providerHead}><IconRobot size={15} />Penyedia AI<small>DeepSeek atau Grok · khusus proyek ini</small></div>
          <div className={ai.presets}>
            {LABEL_AI_PROVIDERS.map((p) => (
              <button key={p.id} type="button" disabled={busy || !p.webSearch} title={p.webSearch ? undefined : "Belum tersedia: pencarian sumbernya belum dibuat"} aria-pressed={p.id === provider.id} data-active={p.id === provider.id || undefined} onClick={() => pickProvider(p)}>{p.label}{p.webSearch ? "" : " · belum tersedia"}</button>
            ))}
          </div>
          <div className={ai.row}>
            <TextInput classNames={inputs} label="Model" value={model} disabled={busy} onChange={(e) => { setModel(e.currentTarget.value); setTest(null); }} placeholder={provider.model} description={`Nama model sesuai dokumentasi ${provider.vendor}`} />
            <TextInput classNames={inputs} label="Base URL" value={provider.baseUrl} readOnly description="Terkunci" />
          </div>
          <PasswordInput classNames={{ ...inputs, innerInput: ai.innerInput }} label="API key penyedia AI" value={apiKey} disabled={busy}
            onChange={(e) => { setApiKey(e.currentTarget.value); setTest(null); }} placeholder={storedHint ? `Tersimpan ••••${storedHint} — kosongkan bila tidak diganti` : `Tempel API key ${provider.vendor}`}
            description="Disimpan terenkripsi, khusus proyek ini." leftSection={<IconShieldLock size={15} />} error={keyProblem}
            // Not a login field: stop browsers and password managers from filling in the admin password.
            autoComplete="new-password" name="ai-label-api-key" data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other" />
          <div className={ai.testRow}>
            <Button size="sm" onDark variant="secondary" icon={IconPlayerPlay} onClick={runTest} loading={testing}
              disabled={!ready || saving}>{testing ? "Menguji…" : "Uji koneksi"}</Button>
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
            description={edited === null ? "Disusun otomatis dari pilihan label proyek ini. Bisa diedit; tambahkan arti tiap label agar AI lebih terarah. Format jawaban diatur sistem." : saved?.prompt != null && edited !== saved.prompt && edited === syncLabelList(saved.prompt, labels)
              ? "Daftar \"Pilihan label\" disesuaikan dengan label proyek. Klik Simpan agar tersimpan."
              : "Sudah diedit. Daftar di bawah \"Pilihan label:\" tetap mengikuti label proyek; bagian lain tidak diubah. Format jawaban diatur sistem."}
            placeholder="Tambahkan pilihan label untuk menyusun instruksi bawaan." />
          {edited !== null && (
            <div className={ai.testRow}><Button size="sm" onDark variant="secondary" icon={IconRefresh} onClick={() => setEdited(null)}>Buat ulang dari label</Button></div>
          )}
        </div>

        <div className={ai.sameToggle}>
          <Switch checked={enabled} onChange={(e) => setEnabled(e.currentTarget.checked)} disabled={busy} color="violet" size="md" label="Aktifkan pelabelan AI"
            description={`${enabled ? "AI melabeli post dalam rentang data, lalu post baru berkala." : "Mati: tidak ada post baru yang dikirim ke AI."} Berlaku setelah disimpan.`} classNames={switches} />
        </div>

        <NumberInput classNames={inputs} label="Batas post per hari" description="Rem biaya. Percobaan ulang ikut dihitung." min={1} max={20000} allowDecimal={false}
          value={dailyLimit} onChange={(v) => setDailyLimit(Number(v) || 1)} />

        {progress && saved && (
          <div className={ai.provider}>
            <div className={ai.providerHead}><IconRobot size={15} />Progres<small>Saat halaman dibuka</small></div>
            <p className={ai.platformNote}>
              {progress.processed.toLocaleString("id-ID")} post diproses · {progress.failed.toLocaleString("id-ID")} kegagalan · hari ini {progress.todayCount.toLocaleString("id-ID")} dikirim ·
              {" "}token masuk {progress.inputTokens.toLocaleString("id-ID")}, keluar {progress.outputTokens.toLocaleString("id-ID")} ·
              {" "}{progress.lastRunAt ? `worker terakhir ${new Date(progress.lastRunAt).toLocaleString("id-ID")}` : "worker belum pernah memproses proyek ini"}
            </p>
            {progress.lastError && <p className={ai.testResult} role="alert"><IconX size={14} />{progress.lastError}</p>}
            {initial?.enabled && (!progress.lastRunAt || openedAt - Date.parse(progress.lastRunAt) > 10 * 60_000) && (
              <p className={ai.testResult} role="alert"><IconX size={14} />Pelabelan aktif, tetapi worker tidak terlihat berjalan lebih dari 10 menit. Periksa npm run label-ai.</p>
            )}
          </div>
        )}

        <RangeField value={startFrom} onChange={setStartFrom} defaultChoice={initial ? undefined : "7"} />

        <div className={ai.sameToggle}>
          <Switch checked={false} disabled color="violet" size="md" label="Tampilkan hanya yang sudah diberi label" description="Tersedia setelah AI bisa memberi label." classNames={switches} />
        </div>

        <div className={ai.testRow}>
          <Button size="sm" variant="primary" icon={IconDeviceFloppy} onClick={save} loading={saving} disabled={!ready || testing}>{saving ? "Menyimpan…" : "Simpan pengaturan AI"}</Button>
          {saved && <span className={ai.platformNote}>Terakhir disimpan {new Date(saved.updatedAt).toLocaleString("id-ID")} oleh {saved.updatedBy}</span>}
        </div>
      </div>
    </section>
  );
}
