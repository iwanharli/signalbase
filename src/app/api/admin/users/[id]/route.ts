import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { PLAN_IDS, TRIAL_DAYS } from "@/lib/plans";

type Context = { params: Promise<{ id: string }> };

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["approve", "suspend", "activate"]) }),
  /** expiresAt: YYYY-MM-DD (end of that day, Jakarta) or null for no end date. */
  z.object({ action: z.literal("setPlan"), plan: z.enum(PLAN_IDS).nullable(), expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable() }),
]);
const NEXT_STATUS = { approve: "active", activate: "active", suspend: "suspended" } as const;

// Admin only, user accounts only: approve a waiting sign-up (which starts the trial), suspend or re-activate it,
// or set its plan and end date.
export const PATCH = adminRoute(async (req: Request, { params }: Context) => {
  const { id } = await params;
  const parsed = actionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Aksi tidak dikenal" }, { status: 400 });
  const body = parsed.data;
  const account = await prisma.admin.findFirst({ where: { id, role: "user" }, select: { plan: true } });
  if (!account) return NextResponse.json({ error: "Pengguna tidak ditemukan" }, { status: 404 });

  if (body.action === "setPlan") {
    const planExpiresAt = body.expiresAt ? new Date(`${body.expiresAt}T23:59:59+07:00`) : null;
    await prisma.admin.update({ where: { id }, data: { plan: body.plan, planExpiresAt } });
    return NextResponse.json({ ok: true });
  }
  // Approving an account that has no plan yet starts its trial.
  const trial = body.action === "approve" && !account.plan ? { plan: "trial", planExpiresAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000) } : {};
  await prisma.admin.update({ where: { id }, data: { status: NEXT_STATUS[body.action], ...trial } });
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
