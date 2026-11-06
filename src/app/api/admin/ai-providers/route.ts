import { NextResponse } from "next/server";
import { providerInputSchema } from "@/lib/ai/classifier";
import { providerData, publicProvider, validationError } from "@/lib/server/ai/admin";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";

// AI providers the admin has connected. Keys are stored encrypted and never returned.
export const GET = adminRoute(async () => {
  const providers = await prisma.aiProvider.findMany({ orderBy: { createdAt: "asc" }, include: { _count: { select: { classifiers: true } } } });
  return NextResponse.json(providers.map((p) => ({ ...publicProvider(p), usedBy: p._count.classifiers })));
});

export const POST = adminRoute(async (req: Request) => {
  const parsed = providerInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error, "Data penyedia tidak valid");
  if (!parsed.data.apiKey) return NextResponse.json({ error: "API key wajib diisi" }, { status: 400 });
  if (parsed.data.kind === "openai_compatible" && !parsed.data.baseUrl) return NextResponse.json({ error: "Base URL wajib diisi" }, { status: 400 });
  const data = providerData(parsed.data);
  const provider = await prisma.aiProvider.create({ data: { ...data, apiKeyEnc: data.apiKeyEnc!, apiKeyHint: data.apiKeyHint! } });
  return NextResponse.json(publicProvider(provider));
});
