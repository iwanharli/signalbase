// Signalbase AI: the platform's own AI provider, configured on the server so users need no API key of their own.
//   SIGNALBASE_AI_KIND            anthropic (default) | openai_compatible
//   SIGNALBASE_AI_BASE_URL        openai_compatible only
//   SIGNALBASE_AI_MODEL           standard model, e.g. claude-haiku-5-5
//   SIGNALBASE_AI_MODEL_ENHANCED  Instansi "model enhancement"; defaults to the standard model
//   SIGNALBASE_AI_API_KEY         the platform's provider key (never sent to the browser)
import type { ProviderKind } from "@/lib/ai/classifier";
import { prisma } from "../db";
import { encryptSecret } from "../secrets";
import type { ProviderConfig } from "./providers";

let cachedEnc: { key: string; enc: string } | null = null;

/** Last 4 characters of Signalbase's own provider key (SIGNALBASE_AI_API_KEY); null when not set. */
export const platformKeyHint = () => (process.env.SIGNALBASE_AI_API_KEY ? process.env.SIGNALBASE_AI_API_KEY.slice(-4) : null);

/** Last 4 characters of the key now paying for a classifier's categorisation (Signalbase's key or the client's own). */
export const classifierKeyHint = (c: { providerKind: string; providerKeyHint: string }) =>
  c.providerKind === "signalbase" ? platformKeyHint() : c.providerKeyHint;

/** When that key was first recorded paying for this project's tokens; earlier balances belong to another key. Null if never.
 *  shortcut: keyHint is only recorded since 16 Nov 2026, so even a key that never changed shows balances from that date. */
export async function keySince(apiKeyId: string, hint: string | null) {
  if (!hint) return null;
  const row = await prisma.tokenUsage.findFirst({ where: { apiKeyId, keyHint: hint }, orderBy: { hour: "asc" }, select: { hour: true } });
  return row?.hour ?? null;
}

export const platformConfigured = () => !!(process.env.SIGNALBASE_AI_API_KEY && process.env.SIGNALBASE_AI_MODEL);

/** The real provider behind Signalbase AI for a tier, or null when the server has not been configured. */
export function platformProvider(tier: string): ProviderConfig | null {
  const key = process.env.SIGNALBASE_AI_API_KEY;
  const model = tier === "enhanced" ? process.env.SIGNALBASE_AI_MODEL_ENHANCED || process.env.SIGNALBASE_AI_MODEL : process.env.SIGNALBASE_AI_MODEL;
  if (!key || !model) return null;
  if (cachedEnc?.key !== key) cachedEnc = { key, enc: encryptSecret(key) };
  const kind = (process.env.SIGNALBASE_AI_KIND === "openai_compatible" ? "openai_compatible" : "anthropic") as ProviderKind;
  return { kind, baseUrl: kind === "openai_compatible" ? process.env.SIGNALBASE_AI_BASE_URL ?? null : null, model, apiKeyEnc: cachedEnc.enc };
}

export const NOT_CONFIGURED = "Signalbase AI belum diaktifkan di server. Hubungi admin.";

/** Current month in Jakarta, YYYY-MM. */
export const monthKey = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }).slice(0, 7);

/** First day of the current month in Jakarta, as a Date. */
function monthStart() {
  return new Date(`${monthKey()}-01T00:00:00+07:00`);
}

/** This month's Signalbase AI quota for an account: the plan's posts plus paid top-ups; null = unlimited. */
export async function aiQuota(ownerId: string, planPosts: number | null) {
  if (planPosts === null) return null;
  const credit = await prisma.aiCredit.findUnique({ where: { accountId_month: { accountId: ownerId, month: monthKey() } }, select: { posts: true } });
  return planPosts + (credit?.posts ?? 0);
}

/** Posts labelled by Signalbase AI this month for all keys of an account (manual corrections not counted). */
export function platformPostsThisMonth(ownerId: string) {
  return prisma.classification.count({
    where: { manual: false, createdAt: { gte: monthStart() }, apiKey: { ownerId, classifier: { providerKind: "signalbase" } } },
  });
}
