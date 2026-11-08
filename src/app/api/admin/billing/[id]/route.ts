import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { markPaid } from "@/lib/server/invoices";

type Context = { params: Promise<{ id: string }> };

// Admin only: mark an invoice paid (activates or extends the plan) or cancel it.
export const PATCH = adminRoute(async (req: Request, { params }: Context, _username, user) => {
  if (user.role !== "admin") return NextResponse.json({ error: "Khusus admin" }, { status: 403 });
  const parsed = z.object({ action: z.enum(["paid", "cancel"]) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Aksi tidak dikenal" }, { status: 400 });
  const { id } = await params;
  if (parsed.data.action === "paid") {
    const inv = await markPaid(id);
    return inv ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Tagihan tidak ditemukan atau sudah diproses" }, { status: 409 });
  }
  const { count } = await prisma.invoice.updateMany({ where: { id, status: "unpaid" }, data: { status: "cancelled" } });
  return count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Hanya tagihan yang belum dibayar yang bisa dibatalkan" }, { status: 409 });
});
