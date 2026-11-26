import { NextResponse } from "next/server";
import { adminRoute, keyAccess } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { overviewView } from "@/lib/server/overviewKey";
import { watchInputSchema } from "@/lib/server/snaWatch";

const MAX_WATCHES = 30;
const SELECT = { id: true, name: true, keywords: true, createdAt: true } as const;

// SNA watches ("pantauan") of the page's project (?key=, same rules as /api/admin/sna), or the whole-bank ones (admins
// and viewers without ?key=). POST {key|null, name, keywords}: project owners and admins; whole bank only for admins.
export const GET = adminRoute(async (req: Request, _ctx, _username, user) => {
  const view = await overviewView(req, user);
  if (view instanceof Response) return view;
  if (view.noKey) return NextResponse.json({ watches: [], canManage: false });
  const watches = await prisma.snaWatch.findMany({ where: { apiKeyId: view.key?.id ?? null }, orderBy: { createdAt: "desc" }, select: SELECT });
  const canManage = view.key ? (await keyAccess(user, view.key.id)) === "full" : user.role === "admin";
  return NextResponse.json({ watches, canManage });
});

export const POST = adminRoute(async (req: Request, _ctx, _username, user) => {
  const parsed = watchInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Data tidak valid" }, { status: 400 });
  const { key, name, keywords } = parsed.data;
  if (key) {
    const access = await keyAccess(user, key);
    if (!access) return NextResponse.json({ error: "Proyek tidak ditemukan" }, { status: 404 });
    if (access !== "full") return NextResponse.json({ error: "Proyek ini dibagikan untuk dilihat saja" }, { status: 403 });
  } else if (user.role !== "admin") {
    return NextResponse.json({ error: "Pantauan seluruh bank data khusus admin" }, { status: 403 });
  }
  if ((await prisma.snaWatch.count({ where: { apiKeyId: key } })) >= MAX_WATCHES) {
    return NextResponse.json({ error: `Maksimal ${MAX_WATCHES} pantauan; hapus yang tidak dipakai dulu` }, { status: 400 });
  }
  const watch = await prisma.snaWatch.create({ data: { apiKeyId: key, name, keywords, createdBy: user.id }, select: SELECT });
  return NextResponse.json({ watch }, { status: 201 });
});
