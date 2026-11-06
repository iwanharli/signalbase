import { NextResponse } from "next/server";
import { providerConfig } from "@/lib/server/ai/admin";
import { providerBalance } from "@/lib/server/ai/balance";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";

type Context = { params: Promise<{ id: string }> };

// Remaining credit of the AI provider account this key's categorisation uses. Fetched live on each request.
export const GET = adminRoute(async (_req: Request, { params }: Context) => {
  const { id } = await params;
  const classifier = await prisma.classifier.findUnique({ where: { apiKeyId: id } });
  if (!classifier) return NextResponse.json({ error: "Kunci ini belum memakai kategorisasi AI" }, { status: 404 });
  try {
    return NextResponse.json(await providerBalance(providerConfig(classifier)), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message.slice(0, 200) }, { status: 502 });
  }
});
