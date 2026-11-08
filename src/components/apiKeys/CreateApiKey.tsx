"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CopyButton, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAdjustmentsHorizontal, IconAlertTriangle, IconArrowLeft, IconArrowRight, IconCheck, IconClipboardCheck, IconCopy, IconId, IconKey,
  IconRobot, IconShieldCheck, IconTag,
} from "@tabler/icons-react";
import { post } from "@/lib/api-client";
import { OPEN_SCOPE, type KeyScope } from "@/lib/media/keyScope";
import { providerLabel } from "@/lib/ai/classifier";
import { ClassifierEditor, draftProblems, emptyDraft, type ClassifierDraft } from "../ai/ClassifierEditor";
import { Segmented } from "../media/controls";
import { Button } from "../ui/Button";
import { SectionLayout, SectionNav, SectionPanel, type SectionItem } from "./KeySections";
import { keyInputClasses, KeywordsInput, ScopeParams, ScopePreview } from "./ScopeFields";
import { keywordText, scopeRestrictions, useProvinceNames, type CreatedKey } from "./shared";
import classes from "./apiKeys.module.css";

type Step = "identity" | "keywords" | "scope" | "ai" | "review";
const STEPS: Step[] = ["identity", "keywords", "scope", "ai", "review"];

function useOrigin() {
  const [origin, setOrigin] = useState("https://<host>");
  useEffect(() => setOrigin(window.location.origin), []);
  return origin;
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className={classes.stepHint}>{children}</p>;
}

function CreateWizard({ onCreated }: { onCreated: (key: CreatedKey) => void }) {
  const [step, setStep] = useState<Step>("identity");
  const [visited, setVisited] = useState<Set<Step>>(new Set(["identity"]));
  const [name, setName] = useState("");
  const [scope, setScope] = useState<KeyScope>(OPEN_SCOPE);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiDraft, setAiDraft] = useState<ClassifierDraft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const provinceName = useProvinceNames();

  const nameValid = name.trim().length >= 2;
  const aiProblems = aiEnabled ? draftProblems(aiDraft) : [];
  const restrictions = scopeRestrictions(scope, provinceName);
  const index = STEPS.indexOf(step);

  const go = (next: Step) => {
    setStep(next);
    setVisited((v) => new Set(v).add(next));
  };

  const items: SectionItem<Step>[] = [
    { id: "identity", label: "Identitas", icon: IconId, summary: name.trim() || "Nama aplikasi", done: nameValid },
    { id: "keywords", label: "Kata kunci", icon: IconTag, summary: scope.keywords.length ? scope.keywords.join(", ") : "Tidak dibatasi kata kunci", done: visited.has("keywords") },
    { id: "scope", label: "Cakupan data", icon: IconAdjustmentsHorizontal, summary: restrictions.length ? restrictions.join(" · ") : "Tanpa batasan", done: visited.has("scope") },
    { id: "ai", label: "Kategorisasi AI", icon: IconRobot, summary: aiEnabled ? (aiProblems.length ? "Belum lengkap" : `${aiDraft.categories.length} kategori`) : "Tidak dipakai",
      done: visited.has("ai") && !aiProblems.length },
    { id: "review", label: "Tinjau & buat", icon: IconClipboardCheck, summary: "Periksa lalu buat proyek" },
  ];

  const submit = async () => {
    if (!nameValid) return go("identity");
    if (aiProblems.length) { go("ai"); return notifications.show({ color: "red", message: `Kategorisasi AI: ${aiProblems[0]}` }); }
    setBusy(true);
    try {
      onCreated(await post("/api/admin/keys", { name, scope, classifier: aiEnabled ? aiDraft : null }) as CreatedKey);
    } catch (err) {
      notifications.show({ color: "red", message: (err as Error).message });
      setBusy(false);
    }
  };

  const footer = (
    <>
      {index > 0 && <Button onDark variant="secondary" icon={IconArrowLeft} onClick={() => go(STEPS[index - 1])}>Kembali</Button>}
      {index === 0 && <Button onDark variant="secondary" href="/api-keys">Batal</Button>}
      {step === "review" ? (
        <Button variant="primary" icon={IconKey} onClick={submit} loading={busy} disabled={!nameValid}>{busy ? "Membuat…" : "Buat proyek"}</Button>
      ) : (
        <Button variant="primary" iconRight={IconArrowRight} onClick={() => go(STEPS[index + 1])} disabled={step === "identity" && !nameValid}>Lanjut</Button>
      )}
    </>
  );

  return (
    <SectionLayout nav={<SectionNav numbered items={items} active={step} onSelect={go} />}>
      {step === "identity" && (
        <SectionPanel icon={IconId} title="Identitas" description="Nama membantu mengenali aplikasi yang memakai proyek ini." footer={footer}>
          <TextInput classNames={keyInputClasses} label="Nama aplikasi" placeholder="mis. KIPERMAS produksi" value={name} autoFocus
            onChange={(e) => setName(e.currentTarget.value)} maxLength={80} onKeyDown={(e) => { if (e.key === "Enter" && nameValid) go("keywords"); }} />
          <Hint>Buat satu proyek per aplikasi dan per lingkungan (produksi, uji coba), supaya masing-masing bisa dicabut sendiri.</Hint>
        </SectionPanel>
      )}

      {step === "keywords" && (
        <SectionPanel icon={IconTag} title="Kata kunci" description="Aplikasi hanya menerima post dan berita yang menyebut salah satu kata kunci." footer={footer}>
          <KeywordsInput scope={scope} onChange={setScope} />
          <Hint>Frasa multi-kata (mis. &ldquo;polda metro&rdquo;) dicocokkan utuh. &ldquo;polisi tidur&rdquo; tidak dihitung sebagai &ldquo;polisi&rdquo;. Kosongkan untuk membuka seluruh bank data.</Hint>
        </SectionPanel>
      )}

      {step === "scope" && (
        <SectionPanel icon={IconAdjustmentsHorizontal} title="Cakupan data" description="Batasan tetap yang dikunci di server. Aplikasi bisa menyaring lebih sempit, tapi tidak bisa melewatinya." footer={footer}>
          <ScopeParams bare scope={scope} onChange={setScope} />
          <Button onDark variant="subtle" size="sm" className={classes.alignStart} onClick={() => setScope({ ...OPEN_SCOPE, keywords: scope.keywords })}>Reset parameter cakupan</Button>
        </SectionPanel>
      )}

      {step === "ai" && (
        <SectionPanel icon={IconRobot} title="Kategorisasi AI" description="Opsional. Setiap item dalam cakupan diberi satu kategori oleh AI di background." footer={footer}>
          <Segmented full options={[{ value: "off", label: "Tidak dipakai" }, { value: "on", label: "Aktifkan kategorisasi AI" }]}
            value={aiEnabled ? "on" : "off"} onChange={(v) => setAiEnabled(v === "on")} />
          {aiEnabled
            ? <ClassifierEditor draft={aiDraft} onChange={setAiDraft} />
            : <Hint>Misalnya kategori 8 Quick Win Kapolri memakai Claude atau DeepSeek. Bisa juga diatur nanti dari halaman detail proyek.</Hint>}
        </SectionPanel>
      )}

      {step === "review" && (
        <SectionPanel icon={IconClipboardCheck} title="Tinjau & buat" description="Periksa ringkasan di bawah. Klik bagian di menu kiri untuk mengubahnya." footer={footer}>
          <dl className={classes.review}>
            <div><dt>Nama</dt><dd>{name.trim() || <em>Belum diisi</em>}</dd><button type="button" onClick={() => go("identity")}>Ubah</button></div>
            <div><dt>Kata kunci</dt><dd>{keywordText(scope.keywords)}</dd><button type="button" onClick={() => go("keywords")}>Ubah</button></div>
            <div><dt>Cakupan</dt><dd>{restrictions.length ? restrictions.join(" · ") : "Tanpa batasan tambahan"}</dd><button type="button" onClick={() => go("scope")}>Ubah</button></div>
            <div><dt>Kategorisasi AI</dt><dd>{aiEnabled ? `${providerLabel(aiDraft.provider.kind, aiDraft.provider.baseUrl)} · ${aiDraft.provider.model} · ${aiDraft.categories.length} kategori` : "Tidak dipakai"}</dd>
              <button type="button" onClick={() => go("ai")}>Ubah</button></div>
          </dl>
          <ScopePreview scope={scope} />
          {aiProblems.length > 0 && <div className={classes.warning}><IconAlertTriangle size={17} />Kategorisasi AI: {aiProblems[0]}</div>}
        </SectionPanel>
      )}
    </SectionLayout>
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
        <div><b>Kunci API untuk {created.name} siap</b><small>Salin dan simpan sebagai secret di aplikasi tersebut.</small></div>
      </div>

      <div className={classes.warning}><IconAlertTriangle size={17} />Simpan kunci sebagai secret di aplikasi. Admin dapat menyalinnya kembali dari halaman detail proyek.</div>

      <div className={classes.secret}>
        <code>{created.key}</code>
        <CopyButton value={created.key}>
          {({ copied, copy }) => (
            <Button variant="primary" icon={copied ? IconCheck : IconCopy} onClick={copy}>{copied ? "Tersalin" : "Salin kunci"}</Button>
          )}
        </CopyButton>
      </div>

      <ScopePreview scope={created.scope} />

      <span className={classes.sectionLabel}>Coba langsung</span>
      <pre className={classes.example}>{example}</pre>

      <div className={classes.createFoot}>
        <Button onDark variant="secondary" onClick={onAnother}>Buat proyek lain</Button>
        <Button variant="primary" href="/api-keys">Selesai, ke daftar proyek</Button>
      </div>
    </div>
  );
}

/** /api-keys/new — step-by-step key creation, then the key value shown once. */
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
      <Link href="/api-keys" className={classes.back}><IconArrowLeft size={16} />Proyek</Link>
      <header className={classes.titleRow}>
        <h1>{created ? "Proyek berhasil dibuat" : "Buat proyek"}</h1>
        <p>{created ? "Langkah terakhir: salin kuncinya." : "Beri akses baca ke aplikasi lain dalam beberapa langkah."}</p>
      </header>
      {created ? <CreatedPanel created={created} onAnother={() => setCreated(null)} /> : <CreateWizard onCreated={setCreated} />}
    </div>
  );
}
