import { NextResponse } from "next/server";
import { AI_SUMMARY_PROVIDERS, aiSettingInputSchema } from "@/lib/ai/summary";
import { validationError } from "@/lib/server/ai/admin";
import { getSetting, MissingKeyError, saveSetting, settingView } from "@/lib/server/ai/summary";
import { adminRoute } from "@/lib/server/auth";

// Platform AI settings (admins only, see ADMIN_ONLY): the provider behind Ringkasan AI, its schedule and prices.
// GET returns { setting: null, defaults } before the first save.
export const GET = adminRoute(async () => {
  const setting = await getSetting();
  const d = AI_SUMMARY_PROVIDERS[0];
  return NextResponse.json({
    setting: setting ? settingView(setting) : null,
    defaults: { provider: { kind: d.kind, baseUrl: d.baseUrl, model: d.model, apiKeyHint: "" }, summaryEnabled: true, summaryHour: 6, includeProjects: true, monthlyBudget: null, priceInput: 0.3, priceCachedInput: 0.006, priceOutput: 1.2, currency: "USD" },
  });
});

export const PUT = adminRoute(async (req: Request, _ctx, username) => {
  const parsed = aiSettingInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error, "Pengaturan AI tidak valid");
  try {
    return NextResponse.json({ setting: settingView(await saveSetting(parsed.data, username)) });
  } catch (e) {
    if (e instanceof MissingKeyError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
});
