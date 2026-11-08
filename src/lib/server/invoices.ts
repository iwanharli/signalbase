// Creating invoices and applying payments.
import { AI_TOPUP, invoiceAmounts, DUE_DAYS, TAX_RATE, type Billing } from "../billing";
import { monthKey } from "./ai/platform";
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
 * Creates an unpaid invoice. Renewing a paid plan early adds time: the period starts when the current one ends.
 * Coming from a trial (or an ended plan) the paid period starts now, so an upgrade is not held back by trial limits.
 */
export async function createInvoice(accountId: string, plan: PlanId, billing: Billing, createdBy: string, opts: { customMonthly?: number | null; note?: string | null } = {}) {
  const account = await prisma.admin.findUniqueOrThrow({ where: { id: accountId }, select: { plan: true, planExpiresAt: true } });
  const now = new Date();
  const periodStart = account.plan !== "trial" && account.planExpiresAt && account.planExpiresAt > now ? account.planExpiresAt : now;
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
export async function createTopupInvoice(accountId: string, plan: string, createdBy: string) {
  const month = monthKey();
  const periodStart = new Date(`${month}-01T00:00:00+07:00`);
  const periodEnd = addMonths(periodStart, 1);
  const tax = Math.round(AI_TOPUP.price * TAX_RATE);
  const now = new Date();
  // Due by the end of the month at the latest: the posts only count for this month.
  const dueAt = new Date(Math.min(now.getTime() + DUE_DAYS * DAY, periodEnd.getTime() - 1));
  return prisma.invoice.create({
    data: {
      number: await nextNumber(), accountId, kind: "topup", plan, billing: "monthly", topupPosts: AI_TOPUP.posts,
      subtotal: AI_TOPUP.price, tax, total: AI_TOPUP.price + tax, periodStart, periodEnd, dueAt, createdBy,
    },
  });
}

/** Marks an invoice paid: a plan invoice sets the account's plan until its period end; a top-up adds its posts to
 *  that month's Signalbase AI quota. */
export async function markPaid(invoiceId: string) {
  return prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.findUnique({ where: { id: invoiceId } });
    if (!inv || inv.status !== "unpaid") return null;
    await tx.invoice.update({ where: { id: invoiceId }, data: { status: "paid", paidAt: new Date() } });
    if (inv.kind === "topup") {
      const month = monthKey(inv.periodStart);
      await tx.aiCredit.upsert({
        where: { accountId_month: { accountId: inv.accountId, month } },
        create: { accountId: inv.accountId, month, posts: inv.topupPosts ?? 0 },
        update: { posts: { increment: inv.topupPosts ?? 0 } },
      });
    } else {
      await tx.admin.update({ where: { id: inv.accountId }, data: { plan: inv.plan, planExpiresAt: inv.periodEnd } });
    }
    return inv;
  });
}
