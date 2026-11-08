// The plan of a panel account, as server code needs it to enforce limits.
import { isExpired, limitsFor, type PlanLimits } from "../plans";
import { prisma } from "./db";

export type AccountPlan = { plan: string | null; expiresAt: Date | null; expired: boolean; limits: PlanLimits };

export async function accountPlan(accountId: string): Promise<AccountPlan> {
  const a = await prisma.admin.findUnique({ where: { id: accountId }, select: { plan: true, planExpiresAt: true } });
  return { plan: a?.plan ?? null, expiresAt: a?.planExpiresAt ?? null, expired: isExpired(a?.planExpiresAt), limits: limitsFor(a?.plan) };
}

/** Message shown when a plan's period is over. */
export const EXPIRED_MESSAGE = "Masa trial atau paket Anda sudah berakhir. Pilih paket untuk mengaktifkan kembali kunci API.";

/** Narrows request filters to the plan's history window by raising `from` (a later `from` from the caller is kept). */
export function clampHistory(query: URLSearchParams, historyDays: number | null) {
  if (!historyDays) return query;
  const earliest = new Date(Date.now() - (historyDays - 1) * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  const from = query.get("from");
  if (!from || from < earliest) {
    const q = new URLSearchParams(query);
    q.set("from", earliest);
    return q;
  }
  return query;
}
