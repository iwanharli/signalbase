import { NextResponse } from "next/server";
import { z } from "zod";
import { isMediaType } from "@/lib/media/types";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";

type Context = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  type: z.string().refine(isMediaType),
  code: z.string().regex(/^[A-Za-z0-9_.:-]{1,200}$/),
  /** One of the project's choices, or null to clear the label. */
  label: z.string().nullable(),
});

// Label one post or article within this project. Owners, admins and sub-accounts the project is shared with may label
// (adminRoute lets sub-accounts through for this path only); viewers are read-only.
export const PUT = adminRoute(async (req: Request, { params }: Context, username) => {
  const { id } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Data label tidak valid" }, { status: 400 });
  const { type, code, label } = parsed.data;
  const key = await prisma.apiKey.findUnique({ where: { id }, select: { manualLabels: true, revokedAt: true } });
  if (!key) return NextResponse.json({ error: "Proyek tidak ditemukan" }, { status: 404 });
  if (key.revokedAt) return NextResponse.json({ error: "Proyek sudah dicabut" }, { status: 409 });
  const where = { apiKeyId_type_code: { apiKeyId: id, type, code } };
  if (label === null) {
    await prisma.itemLabel.deleteMany({ where: { apiKeyId: id, type, code } });
    return NextResponse.json({ label: null });
  }
  if (!key.manualLabels.includes(label)) return NextResponse.json({ error: "Label tidak ada di pilihan proyek ini" }, { status: 400 });
  await prisma.itemLabel.upsert({ where, create: { apiKeyId: id, type, code, label, setBy: username }, update: { label, setBy: username } });
  return NextResponse.json({ label });
});
