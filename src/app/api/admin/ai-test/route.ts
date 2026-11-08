import { NextResponse } from "next/server";
import { z } from "zod";
import { providerSchema, QUICK_WIN_PRESET } from "@/lib/ai/classifier";
import { providerConfig, validationError } from "@/lib/server/ai/admin";
import { classifyBatch, providerErrorMessage, type ProviderConfig } from "@/lib/server/ai/providers";
import { adminRoute, ownsKey } from "@/lib/server/auth";
import { providerNotAllowed } from "@/lib/server/ai/providerPolicy";
import { NOT_CONFIGURED, platformProvider } from "@/lib/server/ai/platform";
import { accountPlan } from "@/lib/server/plan";
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
  /** Which stored key to fall back on: the main provider's or the fallback's. */
  slot: z.enum(["primary", "fallback"]).default("primary"),
});

// Tests a provider configuration from the form before (or after) it is saved.
export const POST = adminRoute(async (req: Request, _ctx, _username, user) => {
  const parsed = testSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error, "Data penyedia tidak valid");
  const { provider, apiKeyId, slot } = parsed.data;
  const blocked = providerNotAllowed(user, provider);
  if (blocked) return NextResponse.json({ ok: false, ms: 0, error: blocked }, { status: 403 });

  // Signalbase AI is tested against the platform's own provider.
  if (provider.kind === "signalbase") {
    if (user.role === "user" && (await accountPlan(user.id)).limits.aiPostsPerMonth === 0) return NextResponse.json({ ok: false, ms: 0, error: "Paket Anda tidak termasuk kategorisasi AI." }, { status: 403 });
    const platform = platformProvider(provider.model);
    if (!platform) return NextResponse.json({ ok: false, ms: 0, error: NOT_CONFIGURED });
    return testProvider(platform);
  }
  let config: ProviderConfig;
  if (provider.apiKey) {
    config = { kind: provider.kind, baseUrl: provider.kind === "openai_compatible" ? provider.baseUrl : null, model: provider.model, apiKeyEnc: encryptSecret(provider.apiKey) };
  } else {
    const stored = apiKeyId && (await ownsKey(user, apiKeyId)) ? await prisma.classifier.findUnique({ where: { apiKeyId } }) : null;
    const enc = slot === "fallback" ? stored?.fallbackKeyEnc : stored?.providerKeyEnc;
    if (!stored || !enc) return NextResponse.json({ ok: false, ms: 0, error: "Isi API key penyedia AI dulu" });
    config = { ...providerConfig(stored), apiKeyEnc: enc, kind: provider.kind, baseUrl: provider.kind === "openai_compatible" ? provider.baseUrl : null, model: provider.model };
  }

  return testProvider(config);
});

/** Classifies a few sample posts with `config` and reports timing and results. */
async function testProvider(config: ProviderConfig) {
  const started = Date.now();
  try {
    const results = await classifyBatch(config, QUICK_WIN_PRESET.prompt, QUICK_WIN_PRESET.categories, SAMPLES);
    return NextResponse.json({ ok: true, ms: Date.now() - started, results: SAMPLES.map((s) => ({ text: s.text, ...results.find((r) => r.id === s.id) })) });
  } catch (error) {
    return NextResponse.json({ ok: false, ms: Date.now() - started, error: providerErrorMessage(error) });
  }
}
