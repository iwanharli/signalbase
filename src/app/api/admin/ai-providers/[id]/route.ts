import { NextResponse } from "next/server";
import { providerInputSchema } from "@/lib/ai/classifier";
import { providerData, publicProvider, validationError } from "@/lib/server/ai/admin";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";

type Context = { params: Promise<{ id: string }> };

// Update a provider. An empty apiKey keeps the stored one.
export const PATCH = adminRoute(async (req: Request, { params }: Context) => {
  const { id } = await params;
  const parsed = providerInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error, "Data penyedia tidak valid");
  if (parsed.data.kind === "openai_compatible" && !parsed.data.baseUrl) return NextResponse.json({ error: "Base URL wajib diisi" }, { status: 400 });
  const exists = await prisma.aiProvider.findUnique({ where: { id } });
  if (!exists) return NextResponse.json({ error: "Penyedia tidak ditemukan" }, { status: 404 });
  const provider = await prisma.aiProvider.update({ where: { id }, data: providerData(parsed.data) });
  return NextResponse.json(publicProvider(provider));
});

// A provider still used by a classifier can't be removed.
export const DELETE = adminRoute(async (_req: Request, { params }: Context) => {
  const { id } = await params;
  const used = await prisma.classifier.count({ where: { providerId: id } });
  if (used) return NextResponse.json({ error: `Masih dipakai ${used} kunci API. Ganti penyedianya dulu.` }, { status: 409 });
  await prisma.aiProvider.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
});
