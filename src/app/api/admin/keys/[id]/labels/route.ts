import { NextResponse } from "next/server";
import { keptLabelNames, normalizeLabels, type LabelRename, type LabelSettings } from "@/lib/media/manualLabels";
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
  const groups = await prisma.itemLabel.groupBy({ by: ["label"], where: { apiKeyId: id }, _count: true });
  const [{ n }] = await prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int n FROM (SELECT 1 FROM "ItemLabel" WHERE "apiKeyId" = ${id} GROUP BY type, code) items`;
  const settings: LabelSettings = {
    labelledItems: n,
    counts: Object.fromEntries(groups.map((g) => [g.label, g._count])),
    options: key.manualLabels,
    canEdit: access === "full" && !key.revokedAt,
    canLabel: user.role !== "viewer" && !!access && !key.revokedAt,
  };
  return NextResponse.json(settings);
});

// Owner or admin: replace the choices. `renames` move posts from an old name to its new one (they keep their label);
// labels given with a choice that was removed are taken off those posts. `removed` counts labels taken off, not posts.
export const PUT = adminRoute(async (req: Request, { params }: Context) => {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  let options: string[];
  try {
    options = normalizeLabels(body?.options);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  const key = await prisma.apiKey.findUnique({ where: { id }, select: { revokedAt: true, manualLabels: true } });
  if (!key) return NextResponse.json({ error: "Proyek tidak ditemukan" }, { status: 404 });
  if (key.revokedAt) return NextResponse.json({ error: "Proyek sudah dicabut" }, { status: 409 });
  // Only renames from a saved choice to a new choice count.
  const renames: LabelRename[] = (Array.isArray(body?.renames) ? body.renames : [])
    .filter((r: LabelRename) => typeof r?.from === "string" && typeof r?.to === "string" && r.from !== r.to && key.manualLabels.includes(r.from) && options.includes(r.to));
  const tmp = `__rename_${Date.now()}_`;
  const keepers = keptLabelNames(key.manualLabels, options, renames);
  const removed = await prisma.$transaction(async (tx) => {
    const { count } = await tx.itemLabel.deleteMany({ where: { apiKeyId: id, label: { notIn: keepers } } });
    // Two steps through a temporary name, so swapping two names (A↔B) cannot merge them.
    for (const [i, r] of renames.entries()) await tx.itemLabel.updateMany({ where: { apiKeyId: id, label: r.from }, data: { label: `${tmp}${i}` } });
    for (const [i, r] of renames.entries()) await tx.itemLabel.updateMany({ where: { apiKeyId: id, label: `${tmp}${i}` }, data: { label: r.to } });
    await tx.apiKey.update({ where: { id }, data: { manualLabels: options } });
    return count;
  });
  return NextResponse.json({ options, removed, renamed: renames.length });
});
