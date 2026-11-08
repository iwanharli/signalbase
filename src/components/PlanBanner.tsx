import Link from "next/link";
import { IconAlertTriangle, IconClockHour4, IconSparkles } from "@tabler/icons-react";
import { AI_WARN_AT } from "@/lib/billing";
import { daysLeft, PLAN_LABEL, isPlanId } from "@/lib/plans";
import classes from "./shell.module.css";

/** Shown to user accounts near or past the end of their trial or paid period. Nothing when there is no end date. */
export function PlanBanner({ plan, expiresAt }: { plan: string | null; expiresAt: string | null }) {
  const left = daysLeft(expiresAt);
  // Trials always show their countdown; paid plans only in their last 3 days.
  if (left === null || (left > 3 && plan !== "trial")) return null;
  const name = isPlanId(plan) ? PLAN_LABEL[plan] : "Paket";
  const expired = left <= 0;
  return (
    <div className={classes.planBanner} data-expired={expired || undefined} role="status">
      {expired ? <IconAlertTriangle size={18} /> : <IconClockHour4 size={18} />}
      <span>
        {expired
          ? <><b>{name} Anda sudah berakhir.</b> Kunci API berhenti bekerja; proyek, keyword, dan pengaturan tetap tersimpan.</>
          : <><b>{name}: {left === 1 ? "hari terakhir" : `sisa ${left} hari`}.</b> Pilih paket agar kunci API tetap bekerja setelahnya.</>}
      </span>
      <Link href="/billing">Perpanjang paket</Link>
    </div>
  );
}

/** Signalbase AI quota notice for user accounts: from 80% of this month's posts, and when it has run out. */
export function AiQuotaBanner({ used, limit }: { used: number; limit: number | null }) {
  if (!limit || used < limit * AI_WARN_AT) return null;
  const full = used >= limit;
  return (
    <div className={classes.planBanner} data-expired={full || undefined} role="status">
      {full ? <IconAlertTriangle size={18} /> : <IconSparkles size={18} />}
      <span>
        {full
          ? <><b>Kuota kategorisasi AI bulan ini habis</b> ({used.toLocaleString("id-ID")} post). Pelabelan dijeda sampai bulan depan; data media tetap bisa diakses.</>
          : <><b>Kuota kategorisasi AI {Math.floor((used / limit) * 100)}% terpakai</b> ({used.toLocaleString("id-ID")} dari {limit.toLocaleString("id-ID")} post).</>}
      </span>
      <Link href="/billing">Tambah kuota</Link>
    </div>
  );
}
