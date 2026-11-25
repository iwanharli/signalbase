import { NextResponse } from "next/server";
import { z } from "zod";
import { providerSchema } from "@/lib/ai/classifier";
import { providerConfig, validationError } from "@/lib/server/ai/admin";
import type { ProviderConfig } from "@/lib/server/ai/providers";
import { testProvider } from "@/lib/server/ai/testProvider";
import { adminRoute, keyAccess } from "@/lib/server/auth";
import { providerNotAllowed } from "@/lib/server/ai/providerPolicy";
import { NOT_CONFIGURED, platformProvider } from "@/lib/server/ai/platform";
import { accountPlan } from "@/lib/server/plan";
import { prisma } from "@/lib/server/db";
import { encryptSecret } from "@/lib/server/secrets";

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
    const stored = apiKeyId && (await keyAccess(user, apiKeyId)) === "full" ? await prisma.classifier.findUnique({ where: { apiKeyId } }) : null;
    const enc = slot === "fallback" ? stored?.fallbackKeyEnc : stored?.providerKeyEnc;
    if (!stored || !enc) return NextResponse.json({ ok: false, ms: 0, error: "Isi API key penyedia AI dulu" });
    config = { ...providerConfig(stored), apiKeyEnc: enc, kind: provider.kind, baseUrl: provider.kind === "openai_compatible" ? provider.baseUrl : null, model: provider.model };
  }

  return testProvider(config);
});
