"use client";
// /billing for user accounts: current plan, ordering Starter or Pro, and the account's invoices.
import { useState } from "react";
import Link from "next/link";
import { Skeleton } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconFileInvoice, IconReceipt } from "@tabler/icons-react";
import { post } from "@/lib/api-client";
import { BILLING_LABEL, BILLINGS, invoiceAmounts, SELF_SERVE_PLANS, TAX_LABEL, type Billing } from "@/lib/billing";
import { daysLeft, PLAN_LABEL, isPlanId, type PlanId } from "@/lib/plans";
import { useApi } from "@/lib/useApi";
import { Button, StatusPill } from "../ui/Button";
import { rupiah, STATUS, tanggal, type InvoiceRow } from "./shared";
import classes from "./billing.module.css";

export function BillingPage({ plan, expiresAt }: { plan: string | null; expiresAt: string | null }) {
  const invoices = useApi<InvoiceRow[]>("/api/admin/billing");
  const [choice, setChoice] = useState<PlanId>("pro");
  const [billing, setBilling] = useState<Billing>("monthly");
  const [busy, setBusy] = useState(false);
  const amounts = invoiceAmounts(choice, billing);
  const left = daysLeft(expiresAt);
  const open = invoices.data?.find((i) => i.status === "unpaid");

  const order = async () => {
    setBusy(true);
    try {
      const inv = await post("/api/admin/billing", { plan: choice, billing }) as InvoiceRow;
      notifications.show({ color: "teal", message: `Tagihan ${inv.number} dibuat` });
      window.location.href = `/billing/${inv.id}`;
    } catch (err) {
      notifications.show({ color: "red", message: (err as Error).message });
      setBusy(false);
    }
  };

  return (
    <div className={classes.page}>
      <header className={classes.hero}>
        <div>
          <span className={classes.badge}><IconReceipt size={13} />Paket & tagihan</span>
          <h1>Paket {isPlanId(plan) ? PLAN_LABEL[plan] : "khusus"}</h1>
          <p>{left === null ? "Tanpa batas waktu." : left <= 0 ? `Berakhir ${tanggal(expiresAt!)}. Kunci API berhenti sampai paket diperpanjang.` : `Berlaku sampai ${tanggal(expiresAt!)} (sisa ${left} hari).`}</p>
        </div>
      </header>

      <div className={classes.grid}>
        <section className={classes.card}>
          <h2>Perpanjang atau naikkan paket</h2>
          {open ? (
            <p className={classes.note}>Ada tagihan <b>{open.number}</b> yang belum dibayar. <Link href={`/billing/${open.id}`}>Lihat instruksi pembayaran</Link>.</p>
          ) : <>
            <div className={classes.choices}>
              {SELF_SERVE_PLANS.map((p) => (
                <button key={p} type="button" data-active={choice === p || undefined} onClick={() => setChoice(p)}>
                  <b>{PLAN_LABEL[p]}</b><small>{rupiah(invoiceAmounts(p, "monthly").subtotal)}/bulan</small>
                </button>
              ))}
            </div>
            <div className={classes.toggle}>
              {BILLINGS.map((b) => <button key={b} type="button" data-active={billing === b || undefined} onClick={() => setBilling(b)}>{BILLING_LABEL[b]}{b === "yearly" && <em>Hemat 10%</em>}</button>)}
            </div>
            <dl className={classes.sum}>
              <dt>Subtotal</dt><dd>{rupiah(amounts.subtotal)}</dd>
              <dt>{TAX_LABEL}</dt><dd>{rupiah(amounts.tax)}</dd>
              <dt className={classes.total}>Total</dt><dd className={classes.total}>{rupiah(amounts.total)}</dd>
            </dl>
            <Button variant="primary" icon={IconFileInvoice} loading={busy} onClick={order}>Buat tagihan</Button>
            <p className={classes.note}>Paket aktif setelah pembayaran dikonfirmasi admin. Butuh paket Instansi? <Link href="/kontak?plan=instansi">Hubungi kami</Link>.</p>
          </>}
        </section>

        <section className={classes.card}>
          <h2>Riwayat tagihan</h2>
          {!invoices.data ? <Skeleton h={80} radius="md" /> : !invoices.data.length ? <p className={classes.note}>Belum ada tagihan.</p> : (
            <ul className={classes.list}>
              {invoices.data.map((i) => {
                const [tone, label] = STATUS[i.status];
                return (
                  <li key={i.id}>
                    <Link href={`/billing/${i.id}`}><b>{i.number}</b><small>{isPlanId(i.plan) ? PLAN_LABEL[i.plan] : i.plan} · {BILLING_LABEL[i.billing]} · {tanggal(i.createdAt)}</small></Link>
                    <span>{rupiah(i.total)}</span>
                    <StatusPill tone={tone}>{label}</StatusPill>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
