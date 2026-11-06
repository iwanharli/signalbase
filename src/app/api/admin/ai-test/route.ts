import { NextResponse } from "next/server";
import { z } from "zod";
import { providerSchema, QUICK_WIN_PRESET } from "@/lib/ai/classifier";
import { providerConfig, validationError } from "@/lib/server/ai/admin";
import { classifyBatch, providerErrorMessage, type ProviderConfig } from "@/lib/server/ai/providers";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { encryptSecret } from "@/lib/server/secrets";

// Two short sample texts with an obvious answer, to check the key, model, and JSON output end to end.
const SAMPLES = [
  { id: "sample-1", text: "Bikin SIM di Satpas dimintai uang tambahan 300 ribu sama oknum petugas, katanya biar cepat." },
  { id: "sample-2", text: "Resep rendang padang yang empuk dan bumbunya meresap." },
];

const testSchema = z.object({
  provider: providerSchema,
  /** When the form leaves the API key empty, test with the key stored for this API key's classifier. */
  apiKeyId: z.string().uuid().nullable().default(null),
});

// Tests a provider configuration from the form before (or after) it is saved.
export const POST = adminRoute(async (req: Request) => {
  const parsed = testSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error, "Data penyedia tidak valid");
  const { provider, apiKeyId } = parsed.data;

  let config: ProviderConfig;
  if (provider.apiKey) {
    config = { kind: provider.kind, baseUrl: provider.kind === "openai_compatible" ? provider.baseUrl : null, model: provider.model, apiKeyEnc: encryptSecret(provider.apiKey) };
  } else {
    const stored = apiKeyId ? await prisma.classifier.findUnique({ where: { apiKeyId } }) : null;
    if (!stored) return NextResponse.json({ ok: false, ms: 0, error: "Isi API key penyedia AI dulu" });
    config = { ...providerConfig(stored), kind: provider.kind, baseUrl: provider.kind === "openai_compatible" ? provider.baseUrl : null, model: provider.model };
  }

  const started = Date.now();
  try {
    const results = await classifyBatch(config, QUICK_WIN_PRESET.prompt, QUICK_WIN_PRESET.categories, SAMPLES);
    return NextResponse.json({ ok: true, ms: Date.now() - started, results: SAMPLES.map((s) => ({ text: s.text, ...results.find((r) => r.id === s.id) })) });
  } catch (error) {
    return NextResponse.json({ ok: false, ms: Date.now() - started, error: providerErrorMessage(error) });
  }
});
