import { NextResponse } from "next/server";
import { z } from "zod";
import { BILLINGS, SELF_SERVE_PLANS } from "@/lib/billing";
import { PLAN_IDS } from "@/lib/plans";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { createInvoice } from "@/lib/server/invoices";

// Users see their own invoices; admins see all, with the account.
export const GET = adminRoute(async (_req: Request, _ctx, _username, user) => {
  const rows = await prisma.invoice.findMany({
    where: user.role === "user" ? { accountId: user.id } : undefined,
    orderBy: { createdAt: "desc" },
    take: 300,
    include: { account: { select: { name: true, username: true } } },
  });
  return NextResponse.json(rows);
});

const schema = z.object({
  plan: z.enum(PLAN_IDS.filter((p) => p !== "trial") as [string, ...string[]]),
  billing: z.enum(BILLINGS as [string, ...string[]]),
  /** Admin only: whose invoice, and an agreed monthly price (Instansi quotes). */
  accountId: z.string().uuid().optional(),
  customMonthly: z.number().int().min(100_000).max(1_000_000_000).nullable().optional(),
  note: z.string().trim().max(300).nullable().optional(),
});

// Users order Starter or Pro for themselves (one open invoice at a time); admins invoice any user account and plan.
export const POST = adminRoute(async (req: Request, _ctx, username, user) => {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Data tagihan tidak valid" }, { status: 400 });
  const body = parsed.data;
  const plan = body.plan as (typeof PLAN_IDS)[number];
  const billing = body.billing as "monthly" | "yearly";

  if (user.role === "user") {
    if (!SELF_SERVE_PLANS.includes(plan)) return NextResponse.json({ error: "Paket Instansi ditawarkan khusus. Hubungi kami lewat halaman kontak." }, { status: 403 });
    if (await prisma.invoice.count({ where: { accountId: user.id, status: "unpaid" } })) {
      return NextResponse.json({ error: "Masih ada tagihan yang belum dibayar. Selesaikan atau minta admin membatalkannya dulu." }, { status: 409 });
    }
    return NextResponse.json(await createInvoice(user.id, plan, billing, username));
  }

  if (!body.accountId) return NextResponse.json({ error: "Pilih akun" }, { status: 400 });
  const account = await prisma.admin.findFirst({ where: { id: body.accountId, role: "user" }, select: { id: true } });
  if (!account) return NextResponse.json({ error: "Akun tidak ditemukan" }, { status: 404 });
  if (plan === "instansi" && !body.customMonthly) return NextResponse.json({ error: "Isi harga per bulan untuk paket Instansi" }, { status: 400 });
  return NextResponse.json(await createInvoice(account.id, plan, billing, username, { customMonthly: body.customMonthly, note: body.note }));
});
