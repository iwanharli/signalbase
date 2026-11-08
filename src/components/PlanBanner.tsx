import Link from "next/link";
import { IconAlertTriangle, IconClockHour4 } from "@tabler/icons-react";
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
          ? <><b>{name} Anda sudah berakhir.</b> Kunci API berhenti bekerja; kunci, keyword, dan pengaturan tetap tersimpan.</>
          : <><b>{name}: {left === 1 ? "hari terakhir" : `sisa ${left} hari`}.</b> Pilih paket agar kunci API tetap bekerja setelahnya.</>}
      </span>
      <Link href="/pricing">Lihat paket</Link>
    </div>
  );
}
