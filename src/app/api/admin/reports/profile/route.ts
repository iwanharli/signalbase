import { NextResponse } from "next/server";
import { z } from "zod";
import { validationError } from "@/lib/server/ai/admin";
import { adminRoute, ownsKey } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { BANK_SCOPE, reportProfile } from "@/lib/server/report";

const profileSchema = z.object({
  recipientTitle: z.string().trim().max(120).default(""),
  recipientName: z.string().trim().max(160).default(""),
  institution: z.string().trim().max(120).default(""),
  region: z.string().trim().max(120).default(""),
  partners: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
  sifat: z.string().trim().max(60).default(""),
});

/** Admins: the bank and any project; users: their own projects. */
async function allowed(scope: string | null, user: Parameters<typeof ownsKey>[0]) {
  if (!scope) return false;
  if (user.role !== "user") return scope === BANK_SCOPE || !!(await prisma.apiKey.findUnique({ where: { id: scope }, select: { id: true } }));
  return scope !== BANK_SCOPE && ownsKey(user, scope);
}

// Report profile of one scope (?scope=bank|<project id>): who its executive reports are written for. Used by the next
// reports written; reports already in the archive keep the profile they were written with.
export const GET = adminRoute(async (req: Request, _ctx, _username, user) => {
  const scope = new URL(req.url).searchParams.get("scope");
  if (!(await allowed(scope, user))) return NextResponse.json({ error: "Cakupan tidak ditemukan" }, { status: 404 });
  return NextResponse.json(await reportProfile(scope!));
});

export const PUT = adminRoute(async (req: Request, _ctx, username, user) => {
  const scope = new URL(req.url).searchParams.get("scope");
  if (!(await allowed(scope, user))) return NextResponse.json({ error: "Cakupan tidak ditemukan" }, { status: 404 });
  const parsed = profileSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error, "Profil laporan tidak valid");
  const data = { ...parsed.data, updatedBy: username };
  await prisma.reportProfile.upsert({ where: { scope: scope! }, create: { scope: scope!, ...data }, update: data });
  return NextResponse.json(await reportProfile(scope!));
});
