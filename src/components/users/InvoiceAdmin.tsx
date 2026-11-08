"use client";
// Admin: every invoice, with mark-paid / cancel, and creating one for a user account (any plan, custom Instansi price).
import { useState } from "react";
import Link from "next/link";
import { NumberInput, Select, Skeleton, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconFileInvoice, IconPlus, IconX } from "@tabler/icons-react";
import { post } from "@/lib/api-client";
import { BILLING_LABEL, BILLINGS, invoiceAmounts, type Billing } from "@/lib/billing";
import { PLAN_LABEL, type PlanId } from "@/lib/plans";
import { useApi } from "@/lib/useApi";
import { describeInvoice, rupiah, STATUS, tanggal, type InvoiceRow } from "../billing/shared";
import { Button, StatusPill } from "../ui/Button";
import classes from "./contactRequests.module.css";

type Account = { id: string; name: string; username: string; status: string };
const PAID_PLANS: PlanId[] = ["starter", "pro", "instansi"];

export function InvoiceAdmin({ accounts, onPlanChanged }: { accounts: Account[]; onPlanChanged: () => void }) {
  const list = useApi<InvoiceRow[]>("/api/admin/billing");
  const [creating, setCreating] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanId>("pro");
  const [billing, setBilling] = useState<Billing>("monthly");
  const [custom, setCustom] = useState<number | string>(7_000_000);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (inv: InvoiceRow, action: "paid" | "cancel") => {
    setBusy(inv.id);
    try {
      await post(`/api/admin/billing/${inv.id}`, { action }, "PATCH");
      notifications.show({ color: action === "paid" ? "teal" : "orange", message: action === "paid" ? `${inv.number} lunas; ${inv.kind === "topup" ? "kuota AI ditambah" : "paket diperbarui"}` : `${inv.number} dibatalkan` });
      list.reload();
      if (action === "paid") onPlanChanged();
    } catch (err) {
      notifications.show({ color: "red", message: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const create = async () => {
    setBusy("new");
    try {
      const inv = await post("/api/admin/billing", { accountId, plan, billing, customMonthly: plan === "instansi" ? Number(custom) : null, note: note || null }) as InvoiceRow;
      notifications.show({ color: "teal", message: `Tagihan ${inv.number} dibuat` });
      setCreating(false); setNote("");
      list.reload();
    } catch (err) {
      notifications.show({ color: "red", message: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const preview = invoiceAmounts(plan, billing, plan === "instansi" ? Number(custom) || 0 : null);
  const unpaid = list.data?.filter((i) => i.status === "unpaid").length ?? 0;

  return (
    <section className={classes.box} id="tagihan">
      <header>
        <h2><IconFileInvoice size={18} />Tagihan</h2>
        <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {list.data && <StatusPill tone={unpaid ? "warning" : "neutral"}>{unpaid} belum dibayar</StatusPill>}
          <Button size="sm" variant="secondary" icon={creating ? IconX : IconPlus} onClick={() => setCreating(!creating)}>{creating ? "Tutup" : "Buat tagihan"}</Button>
        </span>
      </header>

      {creating && (
        <div className={classes.form}>
          <Select label="Akun" searchable placeholder="Pilih akun user" value={accountId} onChange={setAccountId}
            data={accounts.filter((a) => a.status !== "pending").map((a) => ({ value: a.id, label: `${a.name} (@${a.username})` }))} />
          <Select label="Paket" value={plan} onChange={(v) => v && setPlan(v as PlanId)} data={PAID_PLANS.map((p) => ({ value: p, label: PLAN_LABEL[p] }))} />
          <Select label="Periode" value={billing} onChange={(v) => v && setBilling(v as Billing)} data={BILLINGS.map((b) => ({ value: b, label: BILLING_LABEL[b] }))} />
          {plan === "instansi" && <NumberInput label="Harga per bulan (Rp)" value={custom} onChange={setCustom} min={100_000} step={500_000} thousandSeparator="." decimalSeparator="," />}
          <TextInput label="Catatan (opsional)" value={note} onChange={(e) => setNote(e.currentTarget.value)} placeholder="mis. no. PO, nama unit" />
          <div className={classes.formFoot}>
            <span>Total {rupiah(preview.total)} <small>(termasuk PPN {rupiah(preview.tax)})</small></span>
            <Button variant="primary" icon={IconFileInvoice} onClick={create} loading={busy === "new"} disabled={!accountId}>Buat tagihan</Button>
          </div>
        </div>
      )}

      {!list.data ? <Skeleton h={60} radius="md" /> : !list.data.length ? <p className={classes.empty}>Belum ada tagihan.</p> : (
        <div className={classes.list}>
          {list.data.map((i) => {
            const [tone, label] = STATUS[i.status];
            return (
              <article key={i.id} data-handled={i.status !== "unpaid" || undefined}>
                <div className={classes.head}>
                  <Link href={`/billing/${i.id}`}><b>{i.number}</b></Link>
                  <span>{i.account?.name} · {describeInvoice(i)}</span>
                  <StatusPill tone={tone}>{label}</StatusPill>
                  <small>{rupiah(i.total)} · jatuh tempo {tanggal(i.dueAt)}</small>
                </div>
                {i.status === "unpaid" && (
                  <div className={classes.foot}>
                    <span>Periode {tanggal(i.periodStart)} – {tanggal(i.periodEnd)}</span>
                    <Button size="sm" variant="primary" icon={IconCheck} loading={busy === i.id} onClick={() => act(i, "paid")}>Tandai lunas</Button>
                    <Button size="sm" variant="subtle" icon={IconX} disabled={busy === i.id} onClick={() => act(i, "cancel")}>Batalkan</Button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
