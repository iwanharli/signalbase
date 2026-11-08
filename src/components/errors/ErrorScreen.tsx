"use client";
// Branded replacement for Next.js's default error screens. Plain CSS (no Mantine) so it also renders from
// global-error, where the root layout and its providers are gone.
import { useEffect, useState } from "react";
import Link from "next/link";
import { LogoMark } from "../Logo";
import { reloadForUpdate, type ErrorKind } from "./errorKind";
import c from "./errorScreen.module.css";

const COPY: Record<ErrorKind, { code: string; title: string; text: string }> = {
  notFound: {
    code: "404",
    title: "Halaman tidak ditemukan",
    text: "Alamat ini tidak ada atau sudah dipindahkan. Periksa kembali tautannya, atau kembali ke halaman utama.",
  },
  server: {
    code: "500",
    title: "Terjadi kesalahan",
    text: "Ada yang tidak berjalan semestinya di sisi kami. Coba muat ulang halaman. Jika terus berulang, hubungi kami dan sertakan kode kesalahan di bawah.",
  },
  update: {
    code: "BARU",
    title: "Signalbase baru saja diperbarui",
    text: "Versi terbaru sedang dimuat. Jika halaman tidak berganti dalam beberapa detik, muat ulang secara manual.",
  },
  offline: {
    code: "OFFLINE",
    title: "Koneksi terputus",
    text: "Periksa koneksi internet Anda. Halaman akan dicoba lagi otomatis begitu tersambung kembali.",
  },
};

type Props = {
  kind: ErrorKind;
  /** Next.js error digest, shown so users can quote it to support. */
  digest?: string;
  /** Re-renders the failed segment (error boundaries only). */
  onRetry?: () => void;
  /** Inside the panel or the public site: no full-screen backdrop, the surrounding layout stays. */
  inline?: boolean;
  home?: { href: string; label: string };
};

export function ErrorScreen({ kind, digest, onRetry, inline, home = { href: "/", label: "Ke beranda" } }: Props) {
  const copy = COPY[kind];
  const [reloadFailed, setReloadFailed] = useState(false);

  // New build: reload straight away (at most once per 30 s).
  useEffect(() => {
    if (kind === "update" && !reloadForUpdate()) setReloadFailed(true);
  }, [kind]);

  // Offline: retry as soon as the connection is back.
  useEffect(() => {
    if (kind !== "offline") return;
    const back = () => (onRetry ? onRetry() : window.location.reload());
    window.addEventListener("online", back);
    return () => window.removeEventListener("online", back);
  }, [kind, onRetry]);

  const retry = () => (onRetry && kind !== "update" ? onRetry() : window.location.reload());
  const busy = kind === "update" && !reloadFailed;

  return (
    <div className={c.root} data-inline={inline || undefined} data-kind={kind}>
      {!inline && <div className={c.backdrop} aria-hidden><span /><span /><span /></div>}
      <main className={c.card} role={kind === "notFound" ? undefined : "alert"}>
        {!inline && <Link href="/" className={c.brand} aria-label="Signalbase"><LogoMark size={30} /><span>Signal<b>base</b></span></Link>}

        <div className={c.signal} aria-hidden>
          <svg viewBox="0 0 240 60" preserveAspectRatio="none">
            <path className={c.wave} d="M0 30 H70 L82 30 L90 12 L100 48 L110 22 L118 30 H240" />
            <path className={c.flat} d="M0 30 H240" />
          </svg>
          <b>{copy.code}</b>
        </div>

        <h1>{copy.title}</h1>
        <p>{copy.text}</p>

        <div className={c.actions}>
          {kind === "notFound" ? (
            <>
              <Link href={home.href} className={c.primary}>{home.label}</Link>
              <button type="button" className={c.secondary} onClick={() => history.length > 1 ? history.back() : (window.location.href = home.href)}>Kembali</button>
            </>
          ) : (
            <>
              <button type="button" className={c.primary} onClick={retry} disabled={busy}>
                {busy ? <><i className={c.spinner} aria-hidden />Memuat versi terbaru…</> : kind === "update" ? "Muat ulang" : "Coba lagi"}
              </button>
              <Link href={home.href} className={c.secondary}>{home.label}</Link>
            </>
          )}
        </div>

        {kind === "server" && (
          <footer className={c.meta}>
            {digest && <span>Kode kesalahan <code>{digest}</code></span>}
            <Link href="/kontak">Hubungi kami</Link>
          </footer>
        )}
      </main>
    </div>
  );
}
