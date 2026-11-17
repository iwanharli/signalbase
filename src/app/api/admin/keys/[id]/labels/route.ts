import { NextResponse } from "next/server";
import { normalizeLabels, type LabelSettings } from "@/lib/media/manualLabels";
import { adminRoute, keyAccess } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";

type Context = { params: Promise<{ id: string }> };

// Manual label choices of one project (separate from AI categorisation). adminRoute already limits users to projects they
// see, and sub-accounts and viewers to GET.
export const GET = adminRoute(async (_req: Request, { params }: Context, _username, user) => {
  const { id } = await params;
  const key = await prisma.apiKey.findUnique({ where: { id }, select: { manualLabels: true, revokedAt: true } });
  if (!key) return NextResponse.json({ error: "Proyek tidak ditemukan" }, { status: 404 });
  const access = await keyAccess(user, id);
  const settings: LabelSettings = {
    options: key.manualLabels,
    canEdit: access === "full" && !key.revokedAt,
    canLabel: user.role !== "viewer" && !!access && !key.revokedAt,
  };
  return NextResponse.json(settings);
});

// Owner or admin: replace the choices. Labels given with a choice that was removed are taken off those posts.
export const PUT = adminRoute(async (req: Request, { params }: Context) => {
  const { id } = await params;
  let options: string[];
  try {
    options = normalizeLabels((await req.json().catch(() => null))?.options);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  const key = await prisma.apiKey.findUnique({ where: { id }, select: { revokedAt: true } });
  if (!key) return NextResponse.json({ error: "Proyek tidak ditemukan" }, { status: 404 });
  if (key.revokedAt) return NextResponse.json({ error: "Proyek sudah dicabut" }, { status: 409 });
  const [, removed] = await prisma.$transaction([
    prisma.apiKey.update({ where: { id }, data: { manualLabels: options } }),
    prisma.itemLabel.deleteMany({ where: { apiKeyId: id, label: { notIn: options } } }),
  ]);
  return NextResponse.json({ options, removed: removed.count });
});
