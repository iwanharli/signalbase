import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";

type Context = { params: Promise<{ id: string }> };

const actionSchema = z.object({ action: z.enum(["approve", "suspend", "activate"]) });
const NEXT_STATUS = { approve: "active", activate: "active", suspend: "suspended" } as const;

// Admin only: approve a waiting sign-up, suspend an account, or re-activate it. Only role "user" accounts are touched.
export const PATCH = adminRoute(async (req: Request, { params }: Context) => {
  const { id } = await params;
  const parsed = actionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Aksi tidak dikenal" }, { status: 400 });
  const { count } = await prisma.admin.updateMany({ where: { id, role: "user" }, data: { status: NEXT_STATUS[parsed.data.action] } });
  if (!count) return NextResponse.json({ error: "Pengguna tidak ditemukan" }, { status: 404 });
  // A suspended account keeps its keys; the public API refuses them until the account is active again (apiRoute).
  return NextResponse.json({ ok: true });
});

// Admin only: reject a waiting sign-up (the account is deleted; it never had keys).
export const DELETE = adminRoute(async (_req: Request, { params }: Context) => {
  const { id } = await params;
  const { count } = await prisma.admin.deleteMany({ where: { id, role: "user", status: "pending" } });
  if (!count) return NextResponse.json({ error: "Hanya pendaftaran yang menunggu yang bisa ditolak" }, { status: 409 });
  return NextResponse.json({ ok: true });
});
