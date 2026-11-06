"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CopyButton, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAdjustmentsHorizontal, IconAlertTriangle, IconArrowLeft, IconBulb, IconCheck, IconCopy, IconKey, IconLock,
  IconPlus, IconRobot, IconShieldCheck, IconTag,
} from "@tabler/icons-react";
import { post } from "@/lib/api-client";
import { OPEN_SCOPE, type KeyScope } from "@/lib/media/keyScope";
import { useApi } from "@/lib/useApi";
import { ClassifierEditor, draftProblems, emptyDraft, type ClassifierDraft, type ProviderOption } from "../ai/ClassifierEditor";
import { Segmented } from "../media/controls";
import { keyInputClasses, KeywordsInput, ScopeParams, ScopePreview } from "./ScopeFields";
import type { CreatedKey } from "./shared";
import classes from "./apiKeys.module.css";

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

function CreateForm({ onCreated }: { onCreated: (key: CreatedKey) => void }) {
  const [name, setName] = useState("");
  const [scope, setScope] = useState<KeyScope>(OPEN_SCOPE);
  const [busy, setBusy] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiDraft, setAiDraft] = useState<ClassifierDraft>(emptyDraft);
  const providers = useApi<ProviderOption[]>("/api/admin/ai-providers");

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

  return (
    <form className={classes.create} onSubmit={submit}>
      <div className={classes.createHead}>
        <span className={classes.createIcon}><IconPlus size={18} /></span>
        <div><b>Detail kunci</b><small>Nama membantu mengenali aplikasi yang memakai kunci ini.</small></div>
      </div>

      <TextInput classNames={keyInputClasses} label="Nama aplikasi" placeholder="mis. KIPERMAS produksi" value={name} autoFocus
        onChange={(e) => setName(e.currentTarget.value)} required minLength={2} maxLength={80} />
      <KeywordsInput scope={scope} onChange={setScope} />

      <ScopeParams scope={scope} onChange={setScope} />

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
