"use client";
// Editor for a key's AI categorisation: its own AI provider and key, prompt, categories.
// Used on the create-key wizard and on a key's AI settings page.
import { useState } from "react";
import { Loader, PasswordInput, Switch, Textarea, TextInput } from "@mantine/core";
import { IconBrandX, IconCalendarEvent, IconWorld, IconCheck, IconChevronDown, IconPlayerPlay, IconPlus, IconRobot, IconShieldLock, IconSparkles, IconTrash, IconX } from "@tabler/icons-react";
import { post } from "@/lib/api-client";
import { formatNumber } from "@/lib/media/labels";
import { useApi } from "@/lib/useApi";
import { PROVIDER_PRESETS, QUICK_WIN_PRESET, type Category, type ProviderKind } from "@/lib/ai/classifier";
import { DatePickerInput } from "@mantine/dates";
import dayjs from "dayjs";
import "dayjs/locale/id";
import { Button } from "../ui/Button";
import classes from "./ai.module.css";

/** Start of the day N days ago, as ISO. */
export const daysAgo = (days: number) => dayjs().subtract(days, "day").startOf("day").toISOString();

const RANGE_PRESETS = [
  { key: "1", label: "24 jam", days: 1 },
  { key: "7", label: "7 hari", days: 7 },
  { key: "30", label: "30 hari", days: 30 },
  { key: "90", label: "90 hari", days: 90 },
] as const;

/** Item counts in the key's scope from `startFrom` (exact time, as the worker uses), or the whole scope. */
export const estimateUrl = (apiKeyId: string, startFrom: string | null) =>
  `/api/admin/keys/${apiKeyId}/classifier/estimate${startFrom ? `?since=${encodeURIComponent(startFrom)}` : ""}`;

export type Estimate = {
  social: number | null; online: number | null; done: number; doneByType: Record<"social" | "online", number>; remaining: number;
  cost: { currency: string; perThousand: number; remaining: number; sample: number } | null;
};

export const money = (amount: number, currency: string) => {
  try { return new Intl.NumberFormat("id-ID", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: amount < 1 ? 4 : 2 }).format(amount); }
  catch { return `${amount.toFixed(2)} ${currency}`; }
};

/** Items in the key's keywords and scope from the start date: what categorisation will cover. */
function EstimateLine({ apiKeyId, startFrom }: { apiKeyId: string; startFrom: string | null }) {
  const estimate = useApi<Estimate>(estimateUrl(apiKeyId, startFrom));
  const d = estimate.data;
  const total = d ? (d.social ?? 0) + (d.online ?? 0) : 0;
  return (
    <div className={classes.estimate} aria-live="polite">
      {estimate.error ? <span className={classes.estimateError}>{estimate.error}</span>
        : !d || estimate.loading ? <><Loader size={12} color="cyan" />Menghitung data dalam cakupan kunci…</>
        : <>
          {d.social !== null && <span><IconBrandX size={13} />Media sosial <b>{formatNumber(d.social)}</b></span>}
          {d.online !== null && <span><IconWorld size={13} />Media online <b>{formatNumber(d.online)}</b></span>}
          <span className={classes.estimateTotal}>Total <b>{formatNumber(total)}</b> item</span>
        </>}
      {d && !estimate.loading && (
        <p className={classes.estimateCost}>
          {d.cost
            ? <>Perkiraan biaya sisa <b>{formatNumber(d.remaining)}</b> item: <b>≈ {money(d.cost.remaining, d.cost.currency)}</b>
              <span> · {money(d.cost.perThousand, d.cost.currency)} per 1.000 item, diukur dari {formatNumber(d.cost.sample)} item</span></>
            : <>{d.done > 0 && <>{formatNumber(d.done)} sudah dikategorikan · </>}Perkiraan biaya muncul setelah sekitar 50 item diproses, dihitung dari penurunan saldo.</>}
        </p>
      )}
    </div>
  );
}

/** Where labelling starts: a recent window, a chosen date, or the whole scope; new items are always added. */
function RangeField({ value, onChange, apiKeyId }: { value: string | null; onChange: (value: string | null) => void; apiKeyId?: string | null }) {
  const [choice, setChoice] = useState<string>(value ? "custom" : "all");
  const pick = (key: string, next: string | null) => { setChoice(key); onChange(next); };
  return (
    <div className={classes.range}>
      <div className={classes.rangeHead}>
        <span><IconCalendarEvent size={14} />Rentang data</span>
        <small>Mundur sampai tanggal mulai, lalu post baru terus dikategorikan berkala.</small>
      </div>
      <div className={classes.presets}>
        {RANGE_PRESETS.map((p) => (
          <button key={p.key} type="button" data-active={choice === p.key || undefined} onClick={() => pick(p.key, daysAgo(p.days))}>{p.label} terakhir</button>
        ))}
        <button type="button" data-active={choice === "all" || undefined} onClick={() => pick("all", null)}>Semua data</button>
        <button type="button" data-active={choice === "custom" || undefined} onClick={() => pick("custom", value ?? daysAgo(14))}>Tanggal tertentu</button>
      </div>
      {choice === "custom" && (
        <DatePickerInput value={value ? new Date(value) : null} onChange={(d) => d && onChange(dayjs(d).startOf("day").toISOString())}
          maxDate={new Date()} locale="id" valueFormat="D MMMM YYYY" firstDayOfWeek={1} leftSection={<IconCalendarEvent size={16} />}
          classNames={{ input: classes.input }} popoverProps={{ withinPortal: true, zIndex: 400 }} aria-label="Tanggal mulai" />
      )}
      <p className={classes.rangeSummary}>
        {value
          ? <>Post sejak <b>{dayjs(value).locale("id").format("D MMMM YYYY")}</b> sampai <b>terbaru</b>, dan seterusnya berkala.</>
          : <>Semua post dalam cakupan, dari yang <b>terbaru</b> mundur ke paling lama. Bisa memakan banyak kredit.</>}
      </p>
      {apiKeyId && <EstimateLine apiKeyId={apiKeyId} startFrom={value} />}
    </div>
  );
}

export type ProviderDraft = { kind: ProviderKind; baseUrl: string; model: string; apiKey: string };
export type ClassifierDraft = { provider: ProviderDraft; enabled: boolean; prompt: string; categories: Category[]; onlineCategories: Category[] | null; labelledOnly: boolean; startFrom: string | null };
type TestResult = { ok: boolean; ms: number; error?: string; results?: { text: string; category?: string; reason?: string | null }[] };

const providerFromPreset = (id: string): ProviderDraft => {
  const p = PROVIDER_PRESETS.find((x) => x.id === id) ?? PROVIDER_PRESETS[0];
  return { kind: p.kind, baseUrl: p.baseUrl, model: p.model, apiKey: "" };
};
const presetOf = (provider: ProviderDraft) =>
  provider.kind === "anthropic" ? "claude" : PROVIDER_PRESETS.find((p) => p.baseUrl && p.baseUrl === provider.baseUrl.replace(/\/+$/, ""))?.id ?? "custom";

export const emptyDraft = (): ClassifierDraft => ({ provider: providerFromPreset("claude"), enabled: true, prompt: "", categories: [], onlineCategories: null, labelledOnly: false, startFrom: daysAgo(7) });

/** Rough checks shown before saving; the server validates again. `hasStoredKey`: an empty API key keeps the saved one. */
export function draftProblems(draft: ClassifierDraft, hasStoredKey = false) {
  const problems: string[] = [];
  if (!draft.provider.apiKey.trim() && !hasStoredKey) problems.push("Isi API key penyedia AI");
  if (draft.provider.model.trim().length < 2) problems.push("Isi model AI");
  if (draft.provider.kind === "openai_compatible" && !/^https?:\/\//.test(draft.provider.baseUrl.trim())) problems.push("Isi base URL penyedia AI");
  if (draft.prompt.trim().length < 10) problems.push("Prompt minimal 10 karakter");
  const lists: [string, Category[]][] = draft.onlineCategories
    ? [["media sosial", draft.categories], ["media online", draft.onlineCategories]]
    : [["", draft.categories]];
  for (const [name, list] of lists) {
    const where = name ? ` (${name})` : "";
    if (list.length < 2) problems.push(`Minimal 2 kategori${where}`);
    const codes = list.map((c) => c.code.trim().toUpperCase());
    if (codes.some((c) => !/^[A-Z0-9_-]{1,20}$/.test(c))) problems.push(`Kode kategori hanya huruf, angka, - atau _${where}`);
    if (new Set(codes).size !== codes.length) problems.push(`Kode kategori harus unik${where}`);
    if (list.some((c) => c.label.trim().length < 2)) problems.push(`Setiap kategori perlu nama${where}`);
  }
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
  const [categoryTab, setCategoryTab] = useState<"social" | "online">("social");
  const update = (patch: Partial<ClassifierDraft>) => onChange({ ...draft, ...patch });
  const inputClasses = { input: classes.input, label: classes.label, description: classes.description };

  return (
    <div className={classes.editor}>
      <ProviderFields provider={draft.provider} onChange={(provider) => update({ provider })} storedKeyHint={storedKeyHint} apiKeyId={apiKeyId} />


      <RangeField value={draft.startFrom} onChange={(startFrom) => update({ startFrom })} apiKeyId={apiKeyId} />

      <div className={classes.sameToggle}>
        <Switch checked={draft.labelledOnly} onChange={(e) => update({ labelledOnly: e.currentTarget.checked })} color="violet" size="md"
          label="Tampilkan hanya yang sudah dikategorisasi AI"
          description={draft.labelledOnly
            ? "API hanya mengirim item yang sudah diberi kategori (termasuk \"Tidak termasuk\"). Item yang belum diproses disembunyikan sampai selesai."
            : "API mengirim semua item dalam cakupan; item yang belum diproses punya classification: null."}
          classNames={{ label: classes.switchLabel, description: classes.switchDescription }} />
      </div>

      <div className={classes.presetBar}>
        <span><IconSparkles size={14} />Mulai dari preset</span>
        <button type="button" onClick={() => update({ prompt: QUICK_WIN_PRESET.prompt, categories: QUICK_WIN_PRESET.categories.map((c) => ({ ...c })),
          onlineCategories: draft.onlineCategories && QUICK_WIN_PRESET.categories.map((c) => ({ ...c })) })}>
          8 Quick Win Kapolri
        </button>
      </div>

      <Textarea classNames={inputClasses} label="Prompt" description="Instruksi untuk AI. Daftar kategori dan format jawaban ditambahkan otomatis."
        autosize minRows={4} maxRows={12} value={draft.prompt} onChange={(e) => update({ prompt: e.currentTarget.value })}
        placeholder="mis. Klasifikasikan post tentang kepolisian ke dalam program prioritas berikut…" />

      <div className={classes.sameToggle}>
        <Switch checked={draft.onlineCategories === null} onChange={(e) => update({ onlineCategories: e.currentTarget.checked ? null : draft.categories.map((c) => ({ ...c })) })}
          color="violet" size="md" label="Kategori media online sama dengan media sosial"
          description={draft.onlineCategories === null ? "Satu daftar kategori dipakai untuk kedua jenis media." : "Media sosial dan media online punya daftar kategori sendiri."}
          classNames={{ label: classes.switchLabel, description: classes.switchDescription }} />
      </div>

      {draft.onlineCategories === null ? (
        <CategoryList categories={draft.categories} onChange={(categories) => update({ categories })} />
      ) : (
        <>
          <div className={classes.typeTabs} role="tablist">
            {(["social", "online"] as const).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={categoryTab === t} data-active={categoryTab === t || undefined} onClick={() => setCategoryTab(t)}>
                {t === "social" ? "Media sosial" : "Media online"}<b>{(t === "social" ? draft.categories : draft.onlineCategories!).length}</b>
              </button>
            ))}
          </div>
          {categoryTab === "social"
            ? <CategoryList key="social" categories={draft.categories} onChange={(categories) => update({ categories })} />
            : <CategoryList key="online" categories={draft.onlineCategories} onChange={(onlineCategories) => update({ onlineCategories })} />}
        </>
      )}

      <p className={classes.hint}>
        Data dikategorikan dari yang terbaru mundur ke tanggal mulai, sekitar 100 item per menit. Memajukan tanggal mulai tidak menghapus hasil; memundurkannya melanjutkan ke data yang lebih lama.
        Mengubah prompt, kategori, penyedia, atau model akan mengulang kategorisasi dari awal; mengganti API key saja tidak.
      </p>
    </div>
  );
}

/** Editable list of categories: collapsed rows that expand to code, name, and description. */
function CategoryList({ categories, onChange }: { categories: Category[]; onChange: (categories: Category[]) => void }) {
  const [expandedCategory, setExpandedCategory] = useState<number | null>(null);
  const setCategory = (index: number, patch: Partial<Category>) => onChange(categories.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  return (
      <div className={classes.categories}>
        <div className={classes.categoriesHead}>
          <span>Kategori <b>{categories.length}</b></span>
          <small>Pilih kategori untuk melihat atau mengubah detailnya.</small>
        </div>
        {categories.map((category, index) => (
          <div key={index} className={classes.category}>
            <div className={classes.categoryTop}>
              <button type="button" className={classes.categoryToggle} aria-expanded={expandedCategory === index}
                onClick={() => setExpandedCategory(expandedCategory === index ? null : index)}>
                <span className={classes.categorySummaryCode}>{category.code || `K${index + 1}`}</span>
                <span className={classes.categorySummary}>
                  <b>{category.label || "Kategori tanpa nama"}</b>
                  <small>{category.description || "Belum ada deskripsi"}</small>
                </span>
                <IconChevronDown size={17} className={classes.categoryChevron} data-open={expandedCategory === index || undefined} />
              </button>
              <button type="button" className={classes.remove} aria-label={`Hapus kategori ${category.label || index + 1}`}
                onClick={() => { onChange(categories.filter((_, i) => i !== index)); setExpandedCategory((current) => current === index ? null : current !== null && current > index ? current - 1 : current); }}>
                <IconTrash size={16} />
              </button>
            </div>
            {expandedCategory === index && (
              <div className={classes.categoryFields}>
                <TextInput classNames={{ input: classes.input }} aria-label="Kode" placeholder="QW1" value={category.code}
                  onChange={(e) => setCategory(index, { code: e.currentTarget.value.toUpperCase() })} className={classes.code} />
                <div className={classes.categoryBody}>
                  <TextInput classNames={{ input: classes.input }} aria-label="Nama kategori" placeholder="Nama kategori" value={category.label}
                    onChange={(e) => setCategory(index, { label: e.currentTarget.value })} />
                  <Textarea classNames={{ input: classes.input }} aria-label="Deskripsi" placeholder="Apa saja yang termasuk kategori ini (membantu AI)"
                    autosize minRows={1} maxRows={4} value={category.description} onChange={(e) => setCategory(index, { description: e.currentTarget.value })} />
                  <small className={classes.categoryHelp}>Satu item mendapat satu kategori, atau &ldquo;none&rdquo; bila tidak cocok.</small>
                </div>
              </div>
            )}
          </div>
        ))}
        <button type="button" className={classes.add} disabled={categories.length >= 30}
          onClick={() => { setExpandedCategory(categories.length); onChange([...categories, { code: `K${categories.length + 1}`, label: "", description: "" }]); }}>
          <IconPlus size={15} />Tambah kategori
        </button>
      </div>
  );
}
