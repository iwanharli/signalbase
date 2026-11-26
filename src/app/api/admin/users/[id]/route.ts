import { NextResponse } from "next/server";
import { z } from "zod";
import { dateField, endOfDay } from "@/lib/accounts";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";

type Context = { params: Promise<{ id: string }> };

/** expiresAt: the client's last day of access (YYYY-MM-DD, Jakarta), or null for no end date. */
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), expiresAt: dateField.nullable().default(null) }),
  z.object({ action: z.enum(["suspend", "activate"]) }),
  z.object({ action: z.literal("setExpiry"), expiresAt: dateField.nullable() }),
]);

// Admin only, client and viewer accounts: approve a waiting sign-up (with its subscription's last day), suspend or
// re-activate an account, or change a client's last day of access. Invoices (marked paid) extend it too.
export const PATCH = adminRoute(async (req: Request, { params }: Context) => {
  const { id } = await params;
  const parsed = actionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Aksi tidak dikenal" }, { status: 400 });
  const body = parsed.data;
  const account = await prisma.admin.findFirst({ where: { id, role: { in: ["user", "viewer"] } }, select: { role: true, status: true } });
  if (!account) return NextResponse.json({ error: "Pengguna tidak ditemukan" }, { status: 404 });
  const client = account.role === "user";

  if (body.action === "setExpiry") {
    if (!client) return NextResponse.json({ error: "Masa aktif hanya untuk akun klien" }, { status: 409 });
    await prisma.admin.update({ where: { id }, data: { plan: "instansi", planExpiresAt: body.expiresAt ? endOfDay(body.expiresAt) : null } });
    return NextResponse.json({ ok: true });
  }
  if (body.action === "approve") {
    if (account.status !== "pending") return NextResponse.json({ error: "Akun ini tidak sedang menunggu persetujuan" }, { status: 409 });
    await prisma.admin.update({
      where: { id },
      data: { status: "active", ...(client ? { plan: "instansi", planExpiresAt: body.expiresAt ? endOfDay(body.expiresAt) : null } : {}) },
    });
    return NextResponse.json({ ok: true });
  }
  // A suspended client keeps its projects and keys; the panel and the public API refuse it until it is active again.
  await prisma.admin.update({ where: { id }, data: { status: body.action === "suspend" ? "suspended" : "active" } });
  return NextResponse.json({ ok: true });
});

// Admin only: reject a waiting sign-up (the account is deleted; it never had projects).
export const DELETE = adminRoute(async (_req: Request, { params }: Context) => {
  const { id } = await params;
  const { count } = await prisma.admin.deleteMany({ where: { id, role: "user", status: "pending" } });
  if (!count) return NextResponse.json({ error: "Hanya pendaftaran yang menunggu yang bisa ditolak" }, { status: 409 });
  return NextResponse.json({ ok: true });
});
