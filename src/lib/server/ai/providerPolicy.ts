// Which AI endpoints a panel account may point the server at. Admins may use any endpoint; user accounts only the
// known public providers, so a user cannot make the server call an internal or arbitrary address (SSRF).
import { PROVIDER_PRESETS, SIGNALBASE_TIERS } from "@/lib/ai/classifier";
import type { PanelUser } from "../auth";
import { accountPlan } from "../plan";
import { NOT_CONFIGURED, platformConfigured } from "./platform";

const ALLOWED_BASE_URLS = new Set<string>(PROVIDER_PRESETS.map((p) => p.baseUrl).filter(Boolean));
const normalise = (url: string | null | undefined) => (url ?? "").trim().replace(/\/+$/, "");

type Provider = { kind: string; baseUrl?: string | null } | null | undefined;

/** An error message when `user` may not use one of these providers, else null. */
export function providerNotAllowed(user: PanelUser, ...providers: Provider[]): string | null {
  if (user.role !== "user") return null;
  for (const p of providers) {
    if (!p || p.kind !== "openai_compatible") continue;
    if (!ALLOWED_BASE_URLS.has(normalise(p.baseUrl))) return "Penyedia AI kustom hanya untuk admin. Pilih Claude, DeepSeek, atau OpenAI.";
  }
  return null;
}

/**
 * Plan rules for a key's AI categorisation, checked when it is saved. Returns an error message, or null and sets the
 * Signalbase AI tier on `input` (Instansi gets the "enhanced" model; admins may pick either tier).
 *   Starter: no AI categorisation · Trial: Signalbase AI only, no own key or fallback · Pro / Instansi: either
 */
export async function aiPlanProblem(user: PanelUser, input: { provider: { kind: string; model: string }; fallback: unknown }): Promise<string | null> {
  const platform = input.provider.kind === "signalbase";
  if (platform && !platformConfigured()) return NOT_CONFIGURED;
  if (user.role !== "user") {
    if (platform && !(SIGNALBASE_TIERS as readonly string[]).includes(input.provider.model)) input.provider.model = "standard";
    return null;
  }
  const plan = await accountPlan(user.id);
  if (plan.limits.aiPostsPerMonth === 0) return "Paket Anda tidak termasuk kategorisasi AI. Naikkan ke Pro untuk memakainya.";
  if (!plan.limits.ownAiKey && (!platform || input.fallback)) return "Paket trial memakai Signalbase AI tanpa API key sendiri. Pilih Signalbase AI.";
  if (platform) input.provider.model = plan.plan === "instansi" ? "enhanced" : "standard";
  return null;
}
