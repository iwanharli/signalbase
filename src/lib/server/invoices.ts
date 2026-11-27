// Creating invoices and applying payments.
import { invoiceAmounts, DUE_DAYS, type Billing } from "../billing";
import type { PlanId } from "../plans";
import { prisma } from "./db";

const DAY = 86_400_000;

/** Next number for this year: SB-2026-0001, SB-2026-0002, … */
async function nextNumber() {
  const year = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }).slice(0, 4);
  const last = await prisma.invoice.findFirst({ where: { number: { startsWith: `SB-${year}-` } }, orderBy: { number: "desc" }, select: { number: true } });
  const n = last ? Number(last.number.split("-")[2]) + 1 : 1;
  return `SB-${year}-${String(n).padStart(4, "0")}`;
}

/** Adds whole months, keeping the day of month where possible. */
function addMonths(date: Date, months: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

/**
 * Creates an unpaid invoice. Renewing early adds time: the period starts when the current subscription ends (or now, when
 * it has ended or has no end date set).
 */
export async function createInvoice(accountId: string, plan: PlanId, billing: Billing, createdBy: string, opts: { customMonthly?: number | null; note?: string | null } = {}) {
  const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId }, select: { planExpiresAt: true } });
  const now = new Date();
  const periodStart = account.planExpiresAt && account.planExpiresAt > now ? account.planExpiresAt : now;
  const periodEnd = addMonths(periodStart, billing === "yearly" ? 12 : 1);
  const amounts = invoiceAmounts(plan, billing, opts.customMonthly);
  // A unique number could collide if two invoices are made at once; retry once with a fresh number.
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.invoice.create({
        data: { number: await nextNumber(), accountId, plan, billing, ...amounts, periodStart, periodEnd, dueAt: new Date(now.getTime() + DUE_DAYS * DAY), note: opts.note ?? null, createdBy },
      });
    } catch (e) {
      if (attempt >= 1 || (e as { code?: string }).code !== "P2002") throw e;
    }
  }
}

/** An unpaid invoice for extra Signalbase AI posts in the current month (Jakarta). */
/** Marks an invoice paid: the client's subscription runs until the invoice's period end. */
export async function markPaid(invoiceId: string) {
  return prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.findUnique({ where: { id: invoiceId } });
    if (!inv || inv.status !== "unpaid") return null;
    await tx.invoice.update({ where: { id: invoiceId }, data: { status: "paid", paidAt: new Date() } });
    await tx.account.update({ where: { id: inv.accountId }, data: { plan: inv.plan, planExpiresAt: inv.periodEnd } });
    return inv;
  });
}
