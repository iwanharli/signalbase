// The plan of a panel account, as server code needs it to enforce limits.
import { isExpired, limitsFor, type PlanLimits } from "../plans";
import { prisma } from "./db";

export type AccountPlan = { plan: string | null; expiresAt: Date | null; expired: boolean; limits: PlanLimits };

/** The subscription an account works under. */
export async function accountPlan(accountId: string): Promise<AccountPlan> {
  const a = await prisma.account.findUnique({ where: { id: accountId }, select: { plan: true, planExpiresAt: true } });
  return { plan: a?.plan ?? null, expiresAt: a?.planExpiresAt ?? null, expired: isExpired(a?.planExpiresAt), limits: limitsFor(a?.plan) };
}

/** Message shown to a client whose subscription has ended (no prices: money matters are handled by admins). */
export const EXPIRED_MESSAGE = "Masa akses Anda sudah berakhir. Hubungi admin Signalbase untuk memperpanjang.";

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
