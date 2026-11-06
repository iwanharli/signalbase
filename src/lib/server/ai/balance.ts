// Remaining credit at the AI provider, for providers that expose it to ordinary API keys.
// DeepSeek does (GET /user/balance). Anthropic and OpenAI don't, so the panel links to their billing pages.
import { decryptSecret } from "../secrets";
import type { ProviderConfig } from "./providers";

export type Balance =
  | { supported: true; available: boolean; balances: { currency: string; total: number; granted: number; toppedUp: number }[]; checkedAt: string }
  | { supported: false; billingUrl: string | null; reason: string };

const isDeepSeek = (config: ProviderConfig) => !!config.baseUrl && /(^|\.)deepseek\.com$/i.test(new URL(config.baseUrl).host);

function billingUrl(config: ProviderConfig) {
  if (config.kind === "anthropic") return "https://console.anthropic.com/settings/billing";
  if (config.baseUrl && /(^|\.)openai\.com$/i.test(new URL(config.baseUrl).host)) return "https://platform.openai.com/settings/organization/billing";
  return null;
}

async function deepSeekBalance(config: ProviderConfig): Promise<Balance> {
  const res = await fetch(`${new URL(config.baseUrl!).origin}/user/balance`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${decryptSecret(config.apiKeyEnc)}` },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`DeepSeek menolak (${res.status}): ${body?.error?.message ?? res.statusText}`);
  const infos: { currency: string; total_balance: string; granted_balance: string; topped_up_balance: string }[] = body?.balance_infos ?? [];
  return {
    supported: true,
    available: !!body?.is_available,
    balances: infos.map((b) => ({ currency: b.currency, total: Number(b.total_balance), granted: Number(b.granted_balance), toppedUp: Number(b.topped_up_balance) })),
    checkedAt: new Date().toISOString(),
  };
}

export async function providerBalance(config: ProviderConfig): Promise<Balance> {
  if (isDeepSeek(config)) return deepSeekBalance(config);
  const label = config.kind === "anthropic" ? "Claude" : "Penyedia ini";
  return { supported: false, billingUrl: billingUrl(config), reason: `${label} tidak menyediakan cek saldo lewat API key. Lihat saldo di halaman tagihan penyedia.` };
}
