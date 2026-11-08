"use client";
// Printable invoice with transfer instructions. "Cetak / simpan PDF" uses the browser's print dialog.
import Link from "next/link";
import { IconArrowLeft, IconPrinter } from "@tabler/icons-react";
import { BILLING_LABEL, TAX_LABEL, type billingIssuer } from "@/lib/billing";
import { PLAN_LABEL, isPlanId } from "@/lib/plans";
import { LogoMark } from "../Logo";
import { Button, StatusPill } from "../ui/Button";
import { rupiah, STATUS, tanggal, type InvoiceRow } from "./shared";
import classes from "./invoice.module.css";

type Issuer = ReturnType<typeof billingIssuer>;

export function InvoiceView({ invoice: inv, issuer, isAdmin }: { invoice: InvoiceRow; issuer: Issuer; isAdmin: boolean }) {
  const [tone, label] = STATUS[inv.status];
  const planName = isPlanId(inv.plan) ? PLAN_LABEL[inv.plan] : inv.plan;
  const bankReady = issuer.bank && issuer.accountNumber;
  return (
    <div className={classes.wrap}>
      <div className={classes.actions}>
        <Button variant="subtle" icon={IconArrowLeft} href={isAdmin ? "/users#tagihan" : "/billing"}>Kembali</Button>
        <Button variant="primary" icon={IconPrinter} onClick={() => window.print()}>Cetak / simpan PDF</Button>
      </div>
      <article className={classes.paper}>
        <header className={classes.head}>
          <div className={classes.brand}><LogoMark size={36} /><div><b>{issuer.company}</b>{issuer.address && <small>{issuer.address}</small>}{issuer.email && <small>{issuer.email}</small>}</div></div>
          <div className={classes.title}><h1>INVOICE</h1><b>{inv.number}</b><StatusPill tone={tone}>{label}</StatusPill></div>
        </header>

        <div className={classes.meta}>
          <div><small>Ditagihkan kepada</small><b>{inv.account?.name}</b><span>@{inv.account?.username}</span></div>
          <div><small>Tanggal</small><b>{tanggal(inv.createdAt)}</b></div>
          <div><small>Jatuh tempo</small><b>{tanggal(inv.dueAt)}</b></div>
          {inv.paidAt && <div><small>Dibayar</small><b>{tanggal(inv.paidAt)}</b></div>}
        </div>

        <table className={classes.table}>
          <thead><tr><th>Deskripsi</th><th>Periode</th><th className={classes.num}>Jumlah</th></tr></thead>
          <tbody>
            <tr>
              <td>{inv.kind === "topup"
                ? <><b>Tambah kuota kategorisasi AI</b><small>{(inv.topupPosts ?? 0).toLocaleString("id-ID")} post untuk bulan berjalan · paket {planName}</small></>
                : <><b>Signalbase {planName}</b><small>Langganan {BILLING_LABEL[inv.billing].toLowerCase()}{inv.note ? ` · ${inv.note}` : ""}</small></>}</td>
              <td>{tanggal(inv.periodStart)} – {tanggal(inv.periodEnd)}</td>
              <td className={classes.num}>{rupiah(inv.subtotal)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr><td colSpan={2}>Subtotal</td><td className={classes.num}>{rupiah(inv.subtotal)}</td></tr>
            <tr><td colSpan={2}>{TAX_LABEL}</td><td className={classes.num}>{rupiah(inv.tax)}</td></tr>
            <tr className={classes.total}><td colSpan={2}>Total</td><td className={classes.num}>{rupiah(inv.total)}</td></tr>
          </tfoot>
        </table>

        {inv.status === "unpaid" && (
          <section className={classes.pay}>
            <h2>Cara membayar</h2>
            {bankReady ? (
              <ol>
                <li>Transfer tepat <b>{rupiah(inv.total)}</b> ke <b>{issuer.bank} {issuer.accountNumber}</b> a.n. <b>{issuer.accountName}</b>.</li>
                <li>Tulis <b>{inv.number}</b> di berita transfer.</li>
                <li>{inv.kind === "topup" ? "Kuota bertambah" : "Paket aktif"} setelah admin mengonfirmasi pembayaran (biasanya 1×24 jam hari kerja).</li>
              </ol>
            ) : <p>Rekening pembayaran belum diatur. Hubungi admin untuk instruksi pembayaran.</p>}
          </section>
        )}
        <footer className={classes.foot}>Harga mengikuti paket di signalbase.kecup.in/pricing. Dokumen ini dibuat otomatis dan sah tanpa tanda tangan.</footer>
      </article>
      {isAdmin && <p className={classes.hint}>Tandai lunas atau batalkan tagihan ini dari halaman <Link href="/users#tagihan">Pengguna</Link>.</p>}
    </div>
  );
}
