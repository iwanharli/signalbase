"use client";
// Editor for a key's AI categorisation: provider, prompt, categories, daily limit.
// Used on the create-key page and on a key's AI settings page.
import Link from "next/link";
import { NumberInput, Textarea, TextInput } from "@mantine/core";
import { IconPlus, IconRobot, IconSparkles, IconTrash } from "@tabler/icons-react";
import { QUICK_WIN_PRESET, type Category } from "@/lib/ai/classifier";
import { formatNumber } from "@/lib/media/labels";
import { DarkSelect } from "../media/controls";
import classes from "./ai.module.css";

export type ProviderOption = { id: string; name: string; kind: string; model: string; apiKeyHint: string };
export type ClassifierDraft = { providerId: string | null; enabled: boolean; prompt: string; categories: Category[]; dailyLimit: number };

export const emptyDraft = (): ClassifierDraft => ({ providerId: null, enabled: true, prompt: "", categories: [], dailyLimit: 5000 });

/** Rough cost-free sanity checks shown before saving; the server validates again. */
export function draftProblems(draft: ClassifierDraft) {
  const problems: string[] = [];
  if (!draft.providerId) problems.push("Pilih penyedia AI");
  if (draft.prompt.trim().length < 10) problems.push("Prompt minimal 10 karakter");
  if (draft.categories.length < 2) problems.push("Minimal 2 kategori");
  const codes = draft.categories.map((c) => c.code.trim().toUpperCase());
  if (codes.some((c) => !/^[A-Z0-9_-]{1,20}$/.test(c))) problems.push("Kode kategori hanya huruf, angka, - atau _");
  if (new Set(codes).size !== codes.length) problems.push("Kode kategori harus unik");
  if (draft.categories.some((c) => c.label.trim().length < 2)) problems.push("Setiap kategori perlu nama");
  return problems;
}

export function ClassifierEditor({ draft, onChange, providers, providersLoading }: {
  draft: ClassifierDraft;
  onChange: (draft: ClassifierDraft) => void;
  providers: ProviderOption[] | null;
  providersLoading?: boolean;
}) {
  const update = (patch: Partial<ClassifierDraft>) => onChange({ ...draft, ...patch });
  const setCategory = (index: number, patch: Partial<Category>) =>
    update({ categories: draft.categories.map((c, i) => (i === index ? { ...c, ...patch } : c)) });
  const inputClasses = { input: classes.input, label: classes.label, description: classes.description };

  if (providers && !providers.length) {
    return (
      <div className={classes.notice}>
        <IconRobot size={20} />
        <div><b>Belum ada penyedia AI</b><p>Hubungkan Claude, DeepSeek, atau penyedia lain dulu di Pengaturan AI.</p></div>
        <Link href="/settings/ai" className={classes.noticeLink}>Buka Pengaturan AI</Link>
      </div>
    );
  }

  return (
    <div className={classes.editor}>
      <div className={classes.row}>
        <DarkSelect label="Penyedia AI" placeholder={providersLoading ? "Memuat…" : "Pilih penyedia"} clearable={false} searchable={false}
          leftSection={<IconRobot size={15} />} value={draft.providerId}
          data={(providers ?? []).map((p) => ({ value: p.id, label: `${p.name} · ${p.model}` }))}
          onChange={(providerId) => update({ providerId })} classNames={{ label: classes.label }} />
        <NumberInput classNames={inputClasses} label="Batas per hari" description="Item yang diproses maksimal per hari"
          min={10} max={200000} step={1000} thousandSeparator="." decimalSeparator="," value={draft.dailyLimit}
          onChange={(v) => update({ dailyLimit: typeof v === "number" ? v : 5000 })} />
      </div>

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
        Semua data dalam cakupan kunci akan dikategorikan, mulai dari yang terbaru lalu mundur ke data lama, paling banyak {formatNumber(draft.dailyLimit)} item per hari.
        Mengubah prompt, kategori, atau penyedia akan mengulang kategorisasi dari awal.
      </p>
    </div>
  );
}
