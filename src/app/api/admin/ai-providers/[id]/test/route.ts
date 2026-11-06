import { NextResponse } from "next/server";
import { QUICK_WIN_PRESET } from "@/lib/ai/classifier";
import { classifyBatch, providerErrorMessage, type ProviderConfig } from "@/lib/server/ai/providers";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";

type Context = { params: Promise<{ id: string }> };

// Two short sample texts with an obvious answer, to check the key, model, and JSON output end to end.
const SAMPLES = [
  { id: "sample-1", text: "Bikin SIM di Satpas dimintai uang tambahan 300 ribu sama oknum petugas, katanya biar cepat." },
  { id: "sample-2", text: "Resep rendang padang yang empuk dan bumbunya meresap." },
];

export const POST = adminRoute(async (_req: Request, { params }: Context) => {
  const { id } = await params;
  const provider = await prisma.aiProvider.findUnique({ where: { id } });
  if (!provider) return NextResponse.json({ error: "Penyedia tidak ditemukan" }, { status: 404 });
  const started = Date.now();
  try {
    const config: ProviderConfig = { kind: provider.kind as ProviderConfig["kind"], baseUrl: provider.baseUrl, model: provider.model, apiKeyEnc: provider.apiKeyEnc };
    const results = await classifyBatch(config, QUICK_WIN_PRESET.prompt, QUICK_WIN_PRESET.categories, SAMPLES);
    return NextResponse.json({
      ok: true,
      ms: Date.now() - started,
      results: SAMPLES.map((s) => ({ text: s.text, ...results.find((r) => r.id === s.id) })),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, ms: Date.now() - started, error: providerErrorMessage(error) }, { status: 200 });
  }
});
