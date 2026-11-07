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

/** Stores the balance for the usage chart. Skips a write when nothing changed in the last `minGapMs`. */
export async function recordBalance(apiKeyId: string, balance: Balance, minGapMs = 0) {
  if (!balance.supported) return;
  const { prisma } = await import("../db");
  for (const b of balance.balances) {
    const last = await prisma.balanceSnapshot.findFirst({ where: { apiKeyId, currency: b.currency }, orderBy: { at: "desc" } });
    if (last && last.total === b.total && Date.now() - last.at.getTime() < Math.max(minGapMs, 10 * 60_000)) continue;
    await prisma.balanceSnapshot.create({ data: { apiKeyId, currency: b.currency, total: b.total } });
  }
}

/** Balance at most every `everyMs` while the worker runs; failures never stop labelling. */
export async function snapshotIfDue(apiKeyId: string, config: ProviderConfig, everyMs = 15 * 60_000) {
  const { prisma } = await import("../db");
  const last = await prisma.balanceSnapshot.findFirst({ where: { apiKeyId }, orderBy: { at: "desc" }, select: { at: true } });
  if (last && Date.now() - last.at.getTime() < everyMs) return;
  try { await recordBalance(apiKeyId, await providerBalance(config)); } catch { /* shown on the balance card instead */ }
}

export type UsageBucket = { start: string; spent: number; topUp: number };

/** Spend per bucket from consecutive snapshots: a drop is spend, a rise is a top-up. */
export function usageBuckets(points: { total: number; at: Date }[], from: Date, to: Date, bucketMs: number): UsageBucket[] {
  const count = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / bucketMs));
  const buckets = Array.from({ length: count }, (_, i) => ({ start: new Date(from.getTime() + i * bucketMs).toISOString(), spent: 0, topUp: 0 }));
  for (let i = 1; i < points.length; i++) {
    const at = points[i].at.getTime();
    if (at < from.getTime()) continue;
    const index = Math.min(count - 1, Math.floor((at - from.getTime()) / bucketMs));
    const delta = points[i].total - points[i - 1].total;
    if (delta < 0) buckets[index].spent += -delta; else buckets[index].topUp += delta;
  }
  return buckets.map((b) => ({ ...b, spent: Math.round(b.spent * 1e4) / 1e4, topUp: Math.round(b.topUp * 1e4) / 1e4 }));
}

/** Average credit per labelled item, from balance drops and the items labelled between those snapshots (last 30 days). */
export async function costPerItem(apiKeyId: string): Promise<{ currency: string; perItem: number; sample: number } | null> {
  const { prisma } = await import("../db");
  const since = new Date(Date.now() - 30 * 24 * 3_600_000);
  const snapshots = await prisma.balanceSnapshot.findMany({ where: { apiKeyId, at: { gte: since } }, orderBy: { at: "asc" } });
  let spent = 0, items = 0;
  for (let i = 1; i < snapshots.length; i++) {
    const [a, b] = [snapshots[i - 1], snapshots[i]];
    if (a.currency !== b.currency || b.total >= a.total) continue;
    const labelled = await prisma.classification.count({ where: { apiKeyId, createdAt: { gt: a.at, lte: b.at } } });
    if (!labelled) continue;
    spent += a.total - b.total; items += labelled;
  }
  // Too few items gives a noisy figure; wait for a meaningful sample.
  if (items < 50 || !snapshots.length) return null;
  return { currency: snapshots[0].currency, perItem: spent / items, sample: items };
}

export const AUTO_PAUSE_PREFIX = "Dijeda otomatis";

/** Why the classifier must stop now, from recorded balances: credit below the floor or today's spend at the cap. */
export async function spendingStop(apiKeyId: string, minBalance: number | null, dailyBudget: number | null): Promise<string | null> {
  if (minBalance == null && dailyBudget == null) return null;
  const { prisma } = await import("../db");
  const latest = await prisma.balanceSnapshot.findFirst({ where: { apiKeyId }, orderBy: { at: "desc" } });
  if (!latest) return null;
  const fmt = (n: number) => `${latest.currency} ${n.toFixed(2)}`;
  if (minBalance != null && latest.total < minBalance) return `${AUTO_PAUSE_PREFIX}: saldo ${fmt(latest.total)} di bawah batas ${fmt(minBalance)}. Isi saldo lalu lanjutkan.`;
  if (dailyBudget != null) {
    const midnight = new Date(`${new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" })}T00:00:00+07:00`);
    const points = await prisma.balanceSnapshot.findMany({ where: { apiKeyId, currency: latest.currency, at: { gte: midnight } }, orderBy: { at: "asc" } });
    const before = await prisma.balanceSnapshot.findFirst({ where: { apiKeyId, currency: latest.currency, at: { lt: midnight } }, orderBy: { at: "desc" } });
    const series = before ? [before, ...points] : points;
    let spent = 0;
    for (let i = 1; i < series.length; i++) spent += Math.max(0, series[i - 1].total - series[i].total);
    if (spent >= dailyBudget) return `${AUTO_PAUSE_PREFIX}: pemakaian hari ini ${fmt(spent)} mencapai batas ${fmt(dailyBudget)}. Lanjutkan besok atau naikkan batas.`;
  }
  return null;
}
