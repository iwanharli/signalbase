"use client";
// /project/[id]/labels — AI settings of "Kustomisasi Label": Grok choosing among the project's labels.
// shortcut: layout only (nothing is saved, tested or sent; no AI labels anything), until the settings API and the worker exist.
import { useState } from "react";
import Link from "next/link";
import { PasswordInput, Skeleton, Switch, Textarea, TextInput } from "@mantine/core";
import { IconArrowLeft, IconDeviceFloppy, IconPlayerPlay, IconRefresh, IconRobot, IconShieldLock, IconTags } from "@tabler/icons-react";
import { defaultLabelPrompt, type LabelSettings } from "@/lib/media/manualLabels";
import { useApi } from "@/lib/useApi";
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

function LabelAiPanel({ labels }: { labels: string[] }) {
  // null: not edited, so the instruction follows the saved labels.
  const [edited, setEdited] = useState<string | null>(null);
  const [model, setModel] = useState("grok-4.7");
  const [enabled, setEnabled] = useState(false);
  const [startFrom, setStartFrom] = useState<string | null>(() => daysAgo(7));
  const [labelledOnly, setLabelledOnly] = useState(false);
  const inputs = { input: ai.input, label: ai.label, description: ai.description };
  const switches = { label: ai.switchLabel, description: ai.switchDescription };

  return (
    <section className={card.editorCard}>
      <div className={ai.editor}>
        <p className={ai.platformNote} role="note">
          <IconRobot size={15} />Pelabelan otomatis dengan AI <b>segera hadir</b>. Bagian ini baru tampilan: isian belum disimpan dan belum ada post yang dilabeli AI.
        </p>

        <div className={ai.provider}>
          <div className={ai.providerHead}><IconRobot size={15} />Penyedia AI<small>Sementara hanya Grok · khusus proyek ini</small></div>
          <div className={ai.presets}><button type="button" data-active>Grok (xAI)</button></div>
          <div className={ai.row}>
            <TextInput classNames={inputs} label="Model" value={model} onChange={(e) => setModel(e.currentTarget.value)} placeholder="Nama model Grok" description="Nama model sesuai dokumentasi xAI" />
            <TextInput classNames={inputs} label="Base URL" value="https://api.x.ai/v1" readOnly description="Terkunci" />
          </div>
          {/* Disabled while nothing is stored: no real key should be typed into a preview. */}
          <PasswordInput classNames={{ ...inputs, innerInput: ai.innerInput }} label="API key penyedia AI" disabled placeholder="Aktif setelah fitur tersambung" leftSection={<IconShieldLock size={15} />} />
          <div className={ai.testRow}><Button size="sm" onDark variant="secondary" icon={IconPlayerPlay} disabled>Uji koneksi</Button></div>
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
