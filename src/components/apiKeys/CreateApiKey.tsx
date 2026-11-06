"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CopyButton, TagsInput, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle, IconArrowLeft, IconBulb, IconCheck, IconCopy, IconDatabase, IconKey, IconLock, IconPlus, IconShieldCheck, IconTag,
} from "@tabler/icons-react";
import { post } from "@/lib/api-client";
import { KeywordChips, scopeText, type CreatedKey } from "./shared";
import classes from "./apiKeys.module.css";

const TIPS = [
  { icon: IconKey, title: "Satu kunci per aplikasi", text: "Pisahkan produksi dan uji coba agar bisa dicabut sendiri-sendiri." },
  { icon: IconTag, title: "Batasi dengan kata kunci", text: "Aplikasi hanya menerima post dan berita yang menyebut kata kunci tersebut. Frasa multi-kata dicocokkan utuh." },
  { icon: IconLock, title: "Simpan sebagai secret", text: "Kunci hanya ditampilkan sekali. Taruh di variabel lingkungan aplikasi, jangan di repo." },
];

function useOrigin() {
  const [origin, setOrigin] = useState("https://<host>");
  useEffect(() => setOrigin(window.location.origin), []);
  return origin;
}

function CreateForm({ onCreated }: { onCreated: (key: CreatedKey) => void }) {
  const [name, setName] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      onCreated(await post("/api/admin/keys", { name, keywords }) as CreatedKey);
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
      <TagsInput classNames={inputClasses} label="Kata kunci" description="Pisahkan dengan koma atau spasi. Kosongkan untuk membuka seluruh bank."
        placeholder="mis. polri, polisi" value={keywords} onChange={setKeywords} splitChars={[",", " "]} clearable />

      <div className={classes.preview}>
        <span className={classes.sectionLabel}><IconDatabase size={13} />Cakupan data</span>
        <KeywordChips keywords={keywords} />
        <p>{scopeText(keywords)}</p>
      </div>

      <div className={classes.createFoot}>
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
  const example = `curl -H "Authorization: Bearer ${created.key}" \\\n  "${origin}/api/v1/media/online?size=10"`;
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

      <div className={classes.preview}>
        <span className={classes.sectionLabel}><IconDatabase size={13} />Cakupan data</span>
        <KeywordChips keywords={created.keywords} />
      </div>

      <span className={classes.sectionLabel}>Coba langsung</span>
      <pre className={classes.example}>{example}</pre>

      <div className={classes.createFoot}>
        <button type="button" className={classes.ghostLink} onClick={onAnother}>Buat kunci lain</button>
        <Link href="/api-keys" className={classes.primary}>Selesai, ke daftar kunci</Link>
      </div>
    </div>
  );
}

/** /api-keys/new — create a key, then show its value once. */
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
        <p>{created ? "Langkah terakhir: salin kuncinya." : "Beri akses baca ke aplikasi lain, dibatasi dengan kata kunci."}</p>
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
