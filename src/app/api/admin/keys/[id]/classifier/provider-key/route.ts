import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { decryptSecret } from "@/lib/server/secrets";

type Context = { params: Promise<{ id: string }> };

// The stored AI provider key in full, so an admin can copy it. Admin-only, never cached.
export const GET = adminRoute(async (req: Request, { params }: Context) => {
  const { id } = await params;
  const classifier = await prisma.classifier.findUnique({ where: { apiKeyId: id }, select: { providerKeyEnc: true, fallbackKeyEnc: true } });
  const fallback = new URL(req.url).searchParams.get("slot") === "fallback";
  if (!classifier) return NextResponse.json({ error: "Proyek ini belum memakai kategorisasi AI" }, { status: 404 });
  try {
    const enc = fallback ? classifier.fallbackKeyEnc : classifier.providerKeyEnc;
    if (!enc) return NextResponse.json({ error: "Belum ada API key cadangan" }, { status: 404 });
    return NextResponse.json({ apiKey: decryptSecret(enc) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "API key tersimpan tidak bisa dibaca" }, { status: 500 });
  }
});
