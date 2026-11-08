import { NextResponse } from "next/server";
import { z } from "zod";
import { cleanRules, MAX_ACCESS_RULES, normalizeIpRule, normalizeOriginRule } from "@/lib/keyAccess";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";

type Context = { params: Promise<{ id: string }> };

const schema = z.object({
  ips: z.array(z.string().max(60)).max(MAX_ACCESS_RULES),
  origins: z.array(z.string().max(200)).max(MAX_ACCESS_RULES),
});

// Where the project's key may be used from. Empty lists = anywhere. adminRoute already checks a user owns the key.
export const PUT = adminRoute(async (req: Request, { params }: Context) => {
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: `Maksimal ${MAX_ACCESS_RULES} alamat per daftar` }, { status: 400 });
  const ips = cleanRules(parsed.data.ips, normalizeIpRule);
  if (ips.invalid) return NextResponse.json({ error: `Alamat IP tidak valid: ${ips.invalid}` }, { status: 400 });
  const origins = cleanRules(parsed.data.origins, normalizeOriginRule);
  if (origins.invalid) return NextResponse.json({ error: `Domain tidak valid: ${origins.invalid}` }, { status: 400 });

  const key = await prisma.apiKey.findUnique({ where: { id }, select: { revokedAt: true } });
  if (!key) return NextResponse.json({ error: "Proyek tidak ditemukan" }, { status: 404 });
  if (key.revokedAt) return NextResponse.json({ error: "Proyek yang sudah dicabut tidak bisa diubah" }, { status: 409 });
  await prisma.apiKey.update({ where: { id }, data: { allowedIps: ips.rules, allowedOrigins: origins.rules } });
  return NextResponse.json({ ips: ips.rules, origins: origins.rules });
});
