import { NextResponse } from "next/server";
import { aiSettingInputSchema } from "@/lib/ai/summary";
import { validationError } from "@/lib/server/ai/admin";
import { providerErrorMessage } from "@/lib/server/ai/providers";
import { getSetting, testSetting } from "@/lib/server/ai/summary";
import { adminRoute } from "@/lib/server/auth";
import { encryptSecret } from "@/lib/server/secrets";

// Tests the provider in the form (unsaved values; an empty API key uses the stored one). The call is logged with its cost.
export const POST = adminRoute(async (req: Request) => {
  const parsed = aiSettingInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error, "Pengaturan AI tidak valid");
  const stored = await getSetting();
  const p = parsed.data.provider;
  const keyEnc = p.apiKey ? encryptSecret(p.apiKey) : stored?.providerKeyEnc;
  if (!keyEnc) return NextResponse.json({ ok: false, error: "Isi API key penyedia AI dulu" });
  const { provider: _provider, ...rest } = parsed.data; // eslint-disable-line @typescript-eslint/no-unused-vars
  const draft = {
    id: "global", providerKeyHint: "", updatedBy: null, updatedAt: new Date(), ...rest,
    providerKind: p.kind, providerBaseUrl: p.kind === "openai_compatible" ? p.baseUrl || null : null, providerModel: p.model, providerKeyEnc: keyEnc,
  };
  try {
    return NextResponse.json(await testSetting(draft));
  } catch (error) {
    return NextResponse.json({ ok: false, error: providerErrorMessage(error) });
  }
});
