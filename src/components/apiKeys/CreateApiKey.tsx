"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CopyButton, TagsInput, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAdjustmentsHorizontal, IconAlertTriangle, IconArrowLeft, IconBulb, IconCheck, IconCopy, IconDatabase, IconKey, IconLock, IconMapPin,
  IconPlus, IconRobot, IconShieldCheck, IconTag,
} from "@tabler/icons-react";
import { post } from "@/lib/api-client";
import { OPEN_SCOPE, type KeyScope } from "@/lib/media/keyScope";
import { capitalize, humanize } from "@/lib/media/labels";
import type { FilterOptions, MediaType } from "@/lib/media/types";
import { useApi } from "@/lib/useApi";
import { ClassifierEditor, draftProblems, emptyDraft, type ClassifierDraft, type ProviderOption } from "../ai/ClassifierEditor";
import { DarkMultiSelect, Field, Segmented } from "../media/controls";
import { KeywordChips, keywordText, RestrictionChips, scopeRestrictions, useProvinceNames, type CreatedKey } from "./shared";
import classes from "./apiKeys.module.css";

const TYPE_OPTIONS = [{ value: "both", label: "Keduanya" }, { value: "social", label: "Media Sosial" }, { value: "online", label: "Media Online" }] as const;
const ANALYZED_OPTIONS = [{ value: "", label: "Semua" }, { value: "yes", label: "Hanya sudah dianalisis" }] as const;
const RELEVANCE_OPTIONS = [{ value: "", label: "Semua" }, { value: "relevant", label: "Relevan" }, { value: "include", label: "Include" }, { value: "watchlist", label: "Watchlist" }] as const;
const LANGUAGE_OPTIONS = [{ value: "", label: "Semua" }, { value: "id", label: "Indonesia" }, { value: "other", label: "Lainnya" }] as const;
const LEVEL_OPTIONS = [{ value: "0", label: "Semua" }, ...[2, 3, 4, 5].map((n) => ({ value: String(n), label: `≥ ${n}` }))];

const TIPS = [
  { icon: IconKey, title: "Satu kunci per aplikasi", text: "Pisahkan produksi dan uji coba agar bisa dicabut sendiri-sendiri." },
  { icon: IconTag, title: "Kata kunci diketik sendiri", text: "Aplikasi hanya menerima data yang menyebut salah satunya. Frasa multi-kata dicocokkan utuh." },
  { icon: IconAdjustmentsHorizontal, title: "Parameter cakupan dikunci", text: "Aplikasi tetap bisa menyaring lebih sempit lewat parameter API, tapi tidak bisa melewati batas ini." },
  { icon: IconLock, title: "Simpan sebagai secret", text: "Kunci hanya ditampilkan sekali. Taruh di variabel lingkungan aplikasi, jangan di repo." },
];

function useOrigin() {
  const [origin, setOrigin] = useState("https://<host>");
  useEffect(() => setOrigin(window.location.origin), []);
  return origin;
}

/** Filter choices for both media types, so provinces and categories cover everything the key could read. */
function useScopeOptions() {
  const social = useApi<FilterOptions>("/api/admin/media/social?view=options");
  const online = useApi<FilterOptions>("/api/admin/media/online?view=options");
  return useMemo(() => {
    const categories = [...new Set([...(social.data?.categories ?? []), ...(online.data?.categories ?? [])])].sort();
    return {
      provinces: social.data?.provinces ?? online.data?.provinces ?? [],
      categories: categories.map((c) => ({ value: c, label: capitalize(humanize(c)) })),
    };
  }, [social.data, online.data]);
}

function ScopePreview({ scope }: { scope: KeyScope }) {
  const provinceName = useProvinceNames();
  return (
    <div className={classes.preview}>
      <span className={classes.sectionLabel}><IconDatabase size={13} />Ringkasan cakupan</span>
      <p>{keywordText(scope.keywords)}</p>
      <KeywordChips keywords={scope.keywords} />
      <RestrictionChips restrictions={scopeRestrictions(scope, provinceName)} />
    </div>
  );
}

function CreateForm({ onCreated }: { onCreated: (key: CreatedKey) => void }) {
  const [name, setName] = useState("");
  const [scope, setScope] = useState<KeyScope>(OPEN_SCOPE);
  const [busy, setBusy] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiDraft, setAiDraft] = useState<ClassifierDraft>(emptyDraft);
  const providers = useApi<ProviderOption[]>("/api/admin/ai-providers");
  const options = useScopeOptions();
  const update = (patch: Partial<KeyScope>) => setScope((prev) => ({ ...prev, ...patch }));

  const typeValue = scope.types.length === 1 ? scope.types[0] : "both";
  const socialAllowed = typeValue !== "online";

  const setType = (value: "both" | MediaType) =>
    // Relevance and intensity only exist for social posts; drop them when the key can't read those.
    update(value === "both" ? { types: [] } : value === "online" ? { types: ["online"], relevance: "", minLevel: 0 } : { types: ["social"] });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problems = aiEnabled ? draftProblems(aiDraft) : [];
    if (problems.length) return notifications.show({ color: "red", message: `Kategorisasi AI: ${problems[0]}` });
    setBusy(true);
    try {
      onCreated(await post("/api/admin/keys", { name, scope, classifier: aiEnabled ? aiDraft : null }) as CreatedKey);
    } catch (err) {
      notifications.show({ color: "red", message: (err as Error).message });
      setBusy(false);
    }
  };

  const inputClasses = { input: classes.input, label: classes.inputLabel, description: classes.inputDescription, pill: classes.pill };
  return (
    <form className={classes.create} onSubmit={submit}>
      <div className={classes.createHead}>
        <span className={classes.createIcon}><IconPlus size={18} /></span>
        <div><b>Detail kunci</b><small>Nama membantu mengenali aplikasi yang memakai kunci ini.</small></div>
      </div>

      <TextInput classNames={inputClasses} label="Nama aplikasi" placeholder="mis. KIPERMAS produksi" value={name} autoFocus
        onChange={(e) => setName(e.currentTarget.value)} required minLength={2} maxLength={80} />
      <TagsInput classNames={inputClasses} label="Kata kunci" description="Ketik lalu tekan Enter, koma, atau spasi. Kosongkan untuk semua kata kunci."
        placeholder="mis. polri, polisi" value={scope.keywords} onChange={(keywords) => update({ keywords })} splitChars={[",", " "]} clearable />

      <div className={classes.params}>
        <div className={classes.paramsHead}><IconAdjustmentsHorizontal size={15} />Parameter cakupan<small>Opsional · dikunci di server</small></div>
        <div className={classes.paramsGrid}>
          <Field label="Jenis media" wide>
            <Segmented full options={TYPE_OPTIONS} value={typeValue} onChange={setType} />
          </Field>
          <Field label="Status analisis" wide>
            <Segmented full options={ANALYZED_OPTIONS} value={scope.analyzedOnly ? "yes" : ""} onChange={(v) => update({ analyzedOnly: v === "yes" })} />
          </Field>
          <Field label="Relevansi AI (media sosial)" wide>
            <Segmented full disabled={!socialAllowed} options={RELEVANCE_OPTIONS} value={scope.relevance} onChange={(relevance) => update({ relevance })} />
          </Field>
          <Field label="Bahasa">
            <Segmented full options={LANGUAGE_OPTIONS} value={scope.language} onChange={(language) => update({ language })} />
          </Field>
          <Field label="Intensitas emosi min.">
            <Segmented full disabled={!socialAllowed} options={LEVEL_OPTIONS} value={String(scope.minLevel)} onChange={(v) => update({ minLevel: Number(v) })} />
          </Field>
          <Field label="Provinsi" wide>
            <DarkMultiSelect leftSection={<IconMapPin size={15} />} placeholder={scope.provinces.length ? "" : "Seluruh Indonesia"}
              data={options.provinces} value={scope.provinces} onChange={(provinces) => update({ provinces })} />
          </Field>
          <Field label="Kategori" wide>
            <DarkMultiSelect leftSection={<IconTag size={15} />} placeholder={scope.categories.length ? "" : "Semua kategori"}
              data={options.categories} value={scope.categories} onChange={(categories) => update({ categories })} />
          </Field>
        </div>
      </div>

      <div className={classes.params}>
        <div className={classes.paramsHead}>
          <IconRobot size={15} />Kategorisasi AI<small>Opsional · berjalan di background</small>
          <Segmented options={[{ value: "off", label: "Mati" }, { value: "on", label: "Aktif" }]} value={aiEnabled ? "on" : "off"} onChange={(v) => setAiEnabled(v === "on")} />
        </div>
        {aiEnabled
          ? <ClassifierEditor draft={aiDraft} onChange={setAiDraft} providers={providers.data} providersLoading={providers.loading} />
          : <p className={classes.paramsNote}>Beri setiap post dan berita dalam cakupan kunci ini satu kategori (mis. 8 Quick Win Kapolri) memakai Claude, DeepSeek, atau penyedia lain. Bisa juga diatur nanti dari daftar kunci.</p>}
      </div>

      <ScopePreview scope={scope} />

      <div className={classes.createFoot}>
        <button type="button" className={classes.ghostLink} onClick={() => setScope(OPEN_SCOPE)}>Reset parameter</button>
        <Link href="/api-keys" className={classes.ghostLink}>Batal</Link>
        <button type="submit" className={classes.primary} disabled={busy || name.trim().length < 2}>
          <IconKey size={16} />{busy ? "Membuat…" : "Buat kunci"}
        </button>
      </div>
    </form>
  );
}

function CreatedPanel({ created, onAnother }: { created: CreatedKey; onAnother: () => void }) {
  const origin = useOrigin();
  const type = created.scope.types[0] ?? "online";
  const example = `curl -H "Authorization: Bearer ${created.key}" \\\n  "${origin}/api/v1/media/${type}?size=10"`;
  return (
    <div className={classes.created}>
      <div className={classes.createdHead}>
        <span className={classes.successIcon}><IconShieldCheck size={22} /></span>
        <div><b>Kunci untuk {created.name} siap</b><small>Salin dan simpan sebagai secret di aplikasi tersebut.</small></div>
      </div>

      <div className={classes.warning}><IconAlertTriangle size={17} />Kunci ini hanya ditampilkan sekali. Setelah halaman ditutup, kunci tidak bisa dilihat lagi.</div>

      <div className={classes.secret}>
        <code>{created.key}</code>
        <CopyButton value={created.key}>
          {({ copied, copy }) => (
            <button type="button" className={classes.primary} data-copied={copied || undefined} onClick={copy}>
              {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}{copied ? "Tersalin" : "Salin kunci"}
            </button>
          )}
        </CopyButton>
      </div>

      <ScopePreview scope={created.scope} />

      <span className={classes.sectionLabel}>Coba langsung</span>
      <pre className={classes.example}>{example}</pre>

      <div className={classes.createFoot}>
        <button type="button" className={classes.ghostLink} onClick={onAnother}>Buat kunci lain</button>
        <Link href="/api-keys" className={classes.primary}>Selesai, ke daftar kunci</Link>
      </div>
    </div>
  );
}

/** /api-keys/new — create a key with its keywords and fixed scope, then show its value once. */
export function CreateApiKey() {
  const [created, setCreated] = useState<CreatedKey | null>(null);

  // The key is shown only once; warn before navigating away while it is on screen.
  useEffect(() => {
    if (!created) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [created]);

  return (
    <div className={classes.page}>
      <Link href="/api-keys" className={classes.back}><IconArrowLeft size={16} />Kunci API</Link>

      <header className={classes.titleRow}>
        <h1>{created ? "Kunci berhasil dibuat" : "Buat kunci API"}</h1>
        <p>{created ? "Langkah terakhir: salin kuncinya." : "Beri akses baca ke aplikasi lain, dibatasi dengan kata kunci dan parameter cakupan."}</p>
      </header>

      <div className={classes.createLayout}>
        {created ? <CreatedPanel created={created} onAnother={() => setCreated(null)} /> : <CreateForm onCreated={setCreated} />}

        <aside className={classes.tips}>
          <h2><IconBulb size={16} />Tips</h2>
          {TIPS.map((tip) => (
            <div key={tip.title} className={classes.tip}>
              <span><tip.icon size={16} /></span>
              <div><b>{tip.title}</b><p>{tip.text}</p></div>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}
