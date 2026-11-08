"use client";
// /billing for user accounts: current plan, ordering Starter or Pro, and the account's invoices.
import { useState } from "react";
import Link from "next/link";
import { Skeleton } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconFileInvoice, IconReceipt, IconSparkles } from "@tabler/icons-react";
import { post } from "@/lib/api-client";
import { AI_TOPUP, AI_WARN_AT, BILLING_LABEL, BILLINGS, invoiceAmounts, SELF_SERVE_PLANS, TAX_LABEL, type Billing } from "@/lib/billing";
import { daysLeft, PLAN_LABEL, isPlanId, type PlanId } from "@/lib/plans";
import { useApi } from "@/lib/useApi";
import { Button, StatusPill } from "../ui/Button";
import { describeInvoice, rupiah, STATUS, tanggal, type InvoiceRow } from "./shared";
import classes from "./billing.module.css";

/** This month's Signalbase AI usage, with a top-up for plans that allow it. */
function AiQuotaCard({ used, limit, canTopup, busy, onTopup }: { used: number; limit: number; canTopup: boolean; busy: boolean; onTopup: () => void }) {
  const share = Math.min(1, used / limit);
  const state = share >= 1 ? "full" : share >= AI_WARN_AT ? "warn" : undefined;
  return (
    <section className={classes.card}>
      <h2>Kuota kategorisasi AI bulan ini</h2>
      <div className={classes.quota} data-state={state}>
        <div><b>{used.toLocaleString("id-ID")}</b><span>dari {limit.toLocaleString("id-ID")} post</span></div>
        <i><em style={{ width: `${share * 100}%` }} /></i>
        <small>{state === "full" ? "Kuota habis: pelabelan dijeda sampai bulan depan atau kuota ditambah." : state === "warn" ? "Kuota hampir habis." : "Post yang ditandai tidak relevan oleh analisis bank data tidak memakai kuota."}</small>
      </div>
      {canTopup && (
        <Button variant={state ? "primary" : "secondary"} icon={IconSparkles} loading={busy} onClick={onTopup}>
          Tambah {AI_TOPUP.posts.toLocaleString("id-ID")} post · {rupiah(AI_TOPUP.price)} + PPN
        </Button>
      )}
    </section>
  );
}

export function BillingPage({ plan, expiresAt, canTopup }: { plan: string | null; expiresAt: string | null; canTopup: boolean }) {
  const invoices = useApi<InvoiceRow[]>("/api/admin/billing");
  const usage = useApi<{ ai?: { used: number; limit: number | null } }>("/api/admin/usage");
  const [choice, setChoice] = useState<PlanId>("pro");
  const [billing, setBilling] = useState<Billing>("monthly");
  const [busy, setBusy] = useState(false);
  const amounts = invoiceAmounts(choice, billing);
  const left = daysLeft(expiresAt);
  const open = invoices.data?.find((i) => i.status === "unpaid");

  const order = async (body: object = { plan: choice, billing }) => {
    setBusy(true);
    try {
      const inv = await post("/api/admin/billing", body) as InvoiceRow;
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
            <Button variant="primary" icon={IconFileInvoice} loading={busy} onClick={() => order()}>Buat tagihan</Button>
            <p className={classes.note}>Paket aktif setelah pembayaran dikonfirmasi admin. Butuh paket Instansi? <Link href="/kontak?plan=instansi">Hubungi kami</Link>.</p>
          </>}
        </section>

        {usage.data?.ai?.limit ? <AiQuotaCard used={usage.data.ai.used} limit={usage.data.ai.limit} canTopup={canTopup && !open} busy={busy} onTopup={() => order({ kind: "topup" })} /> : null}

        <section className={classes.card}>
          <h2>Riwayat tagihan</h2>
          {!invoices.data ? <Skeleton h={80} radius="md" /> : !invoices.data.length ? <p className={classes.note}>Belum ada tagihan.</p> : (
            <ul className={classes.list}>
              {invoices.data.map((i) => {
                const [tone, label] = STATUS[i.status];
                return (
                  <li key={i.id}>
                    <Link href={`/billing/${i.id}`}><b>{i.number}</b><small>{describeInvoice(i)} · {tanggal(i.createdAt)}</small></Link>
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
