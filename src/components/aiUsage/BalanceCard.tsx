"use client";
// Remaining credit at the key's AI provider, with a refresh button.
import { IconAlertTriangle, IconExternalLink, IconRefresh, IconWallet } from "@tabler/icons-react";
import dayjs from "dayjs";
import "dayjs/locale/id";
import { useApi } from "@/lib/useApi";
import { Button } from "../ui/Button";
import classes from "./balance.module.css";

type Balance =
  | { supported: true; available: boolean; balances: { currency: string; total: number; granted: number; toppedUp: number }[]; checkedAt: string }
  | { supported: false; billingUrl: string | null; reason: string };

const money = (amount: number, currency: string) => {
  try { return new Intl.NumberFormat("id-ID", { style: "currency", currency, minimumFractionDigits: 2 }).format(amount); }
  catch { return `${amount.toFixed(2)} ${currency}`; }
};

/** `onDark` for dark panels. Balance is fetched live when shown and on refresh. */
export function BalanceCard({ keyId, onDark, compact }: { keyId: string; onDark?: boolean; compact?: boolean }) {
  const balance = useApi<Balance>(`/api/admin/keys/${keyId}/classifier/balance`);
  const data = balance.data;
  const refresh = (
    <Button size="sm" variant="subtle" onDark={onDark} iconOnly icon={IconRefresh} onClick={balance.reload} loading={balance.loading}>Perbarui saldo</Button>
  );

  // One-line form for summary strips: label, amount, refresh.
  if (compact) {
    const first = data?.supported ? data.balances[0] : null;
    return (
      <div className={classes.compact} data-on-dark={onDark || undefined}>
        <span className={classes.icon}><IconWallet size={15} /></span>
        <div>
          <small>Saldo</small>
          {balance.error ? <em>Gagal dimuat</em>
            : !data ? <i className={classes.compactSkeleton} />
            : first ? <strong data-low={first.total < 1 || undefined}>{money(first.total, first.currency)}</strong>
            : data.supported ? <em>—</em>
            : data.billingUrl ? <a href={data.billingUrl} target="_blank" rel="noopener noreferrer" className={classes.link}>Halaman tagihan <IconExternalLink size={12} /></a>
            : <em>Tidak tersedia</em>}
        </div>
        {data?.supported !== false && refresh}
      </div>
    );
  }

  return (
    <div className={classes.card} data-on-dark={onDark || undefined}>
      <header className={classes.head}>
        <span className={classes.icon}><IconWallet size={16} /></span>
        <b>Saldo penyedia AI</b>
        {refresh}
      </header>

      {balance.error ? (
        <p className={classes.error}><IconAlertTriangle size={14} />{balance.error}</p>
      ) : !data ? (
        <div className={classes.skeleton} />
      ) : data.supported ? (
        <>
          {data.balances.map((b) => (
            <div key={b.currency} className={classes.amount}>
              <strong data-low={b.total < 1 || undefined}>{money(b.total, b.currency)}</strong>
              <small>Top-up {money(b.toppedUp, b.currency)} · bonus {money(b.granted, b.currency)}</small>
            </div>
          ))}
          {!data.available && <p className={classes.error}><IconAlertTriangle size={14} />Saldo tidak cukup; kategorisasi akan gagal sampai diisi ulang.</p>}
          <small className={classes.meta}>Diperbarui {dayjs(data.checkedAt).locale("id").format("HH:mm:ss")}</small>
        </>
      ) : (
        <>
          <p className={classes.note}>{data.reason}</p>
          {data.billingUrl && (
            <a href={data.billingUrl} target="_blank" rel="noopener noreferrer" className={classes.link}>Buka halaman tagihan <IconExternalLink size={13} /></a>
          )}
        </>
      )}
    </div>
  );
}
