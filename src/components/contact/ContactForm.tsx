"use client";
// Sales enquiry form on /kontak. The plan the visitor came from (?plan=instansi) is sent along.
import { useState } from "react";
import Link from "next/link";
import { IconCheck, IconSend } from "@tabler/icons-react";
import c from "./contact.module.css";

const FIELDS = [
  { name: "name", label: "Nama", type: "text", autoComplete: "name", required: true },
  { name: "organization", label: "Instansi / perusahaan", type: "text", autoComplete: "organization", required: true },
  { name: "email", label: "Email kerja", type: "email", autoComplete: "email", required: true },
  { name: "phone", label: "Nomor WhatsApp (opsional)", type: "tel", autoComplete: "tel", required: false },
] as const;

export function ContactForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const plan = new URLSearchParams(window.location.search).get("plan") ?? undefined;
    const res = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...data, plan }) });
    if (res.ok) setSent(true);
    else setError((await res.json().catch(() => ({}))).error ?? "Gagal mengirim. Coba lagi.");
    setBusy(false);
  };

  if (sent) {
    return (
      <div className={c.sent}>
        <span><IconCheck size={26} /></span>
        <h3>Terima kasih, permintaan Anda terkirim.</h3>
        <p>Tim kami akan menghubungi Anda melalui email atau WhatsApp dalam 1–2 hari kerja.</p>
      </div>
    );
  }
  return (
    <form className={c.form} onSubmit={submit}>
      <div className={c.grid}>
        {FIELDS.map((f) => (
          <label key={f.name} className={c.field}>
            <span>{f.label}</span>
            <input name={f.name} type={f.type} autoComplete={f.autoComplete} required={f.required} />
          </label>
        ))}
      </div>
      <label className={c.field}>
        <span>Kebutuhan Anda</span>
        <textarea name="message" rows={5} required placeholder="Contoh: kami ingin memantau isu pelayanan publik di 5 provinsi, butuh riwayat 2 tahun dan integrasi ke dashboard internal." />
      </label>
      {error && <p className={c.error}>{error}</p>}
      <button type="submit" className={c.submit} disabled={busy}><IconSend size={17} />{busy ? "Mengirim…" : "Kirim permintaan"}</button>
      <small className={c.note}>Data ini hanya dipakai untuk menghubungi Anda terkait Signalbase. Lihat <Link href="/privasi">kebijakan privasi</Link>.</small>
    </form>
  );
}
