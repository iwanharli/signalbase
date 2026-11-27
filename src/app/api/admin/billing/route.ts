import { NextResponse } from "next/server";
import { z } from "zod";
import { BILLINGS } from "@/lib/billing";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { createInvoice } from "@/lib/server/invoices";

// Admin only (ADMIN_ONLY in auth.ts): every invoice, with its account.
export const GET = adminRoute(async () => {
  const rows = await prisma.invoice.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
    include: { account: { select: { name: true, username: true } } },
  });
  return NextResponse.json(rows);
});

const schema = z.object({
  accountId: z.string().uuid(),
  billing: z.enum(BILLINGS as [string, ...string[]]),
  /** The monthly price agreed with the client (Instansi is always quoted). */
  customMonthly: z.number().int().min(100_000, "Harga per bulan minimal Rp100.000").max(1_000_000_000),
  note: z.string().trim().max(300).nullable().optional(),
});

// Admin only: an Instansi invoice for a client (paid manually; marking it paid extends the client's access).
export const POST = adminRoute(async (req: Request, _ctx, username) => {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Data tagihan tidak valid" }, { status: 400 });
  const body = parsed.data;
  const account = await prisma.account.findFirst({ where: { id: body.accountId, role: "user" }, select: { id: true } });
  if (!account) return NextResponse.json({ error: "Instansi tidak ditemukan" }, { status: 404 });
  return NextResponse.json(await createInvoice(account.id, "instansi", body.billing as "monthly" | "yearly", username, { customMonthly: body.customMonthly, note: body.note }));
});
