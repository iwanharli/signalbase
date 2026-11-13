// Ringkasan AI: once a day the platform AI reads each scope's statistics plus a sample of its posts and news, and writes a
// short briefing for the Ringkasan / Beranda page. One scope is the whole bank ("bank"); each active API key is another.
// Every provider call is logged with its tokens and estimated cost (AiUsageLog) for the AI settings page.
import type { AiSetting, Prisma } from "@prisma/client";
import { callCost, summaryContentSchema, withSources, type AiSettingInput, type AiSettingView, type SummaryContent } from "@/lib/ai/summary";
import { parseKeyScope, type KeyScope } from "@/lib/media/keyScope";
import { prisma } from "../db";
import { encryptSecret, secretHint } from "../secrets";
import { completeJson, providerErrorMessage, type CallUsage, type ProviderConfig } from "./providers";
import { buildInput, SYSTEM_PROMPT, type PreviousSummary } from "./summaryInput";

export const BANK_SCOPE = "bank";
const BANK_NAME = "Seluruh bank data";
/** Failed days are retried on later ticks, at most this many attempts, at least RETRY_MS apart. */
const MAX_ATTEMPTS = 3;
const RETRY_MS = 20 * 60_000;

export const jakartaDay = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
const jakartaHour = () => Number(new Date().toLocaleString("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", hour12: false }));
/** The day a summary written now covers: yesterday in Jakarta, the newest day whose data is complete. */
export const dataDay = () => jakartaDay(new Date(Date.now() - 86_400_000));
const monthStart = () => new Date(`${jakartaDay().slice(0, 7)}-01T00:00:00+07:00`);

// ---------------------------------------------------------------- settings

export const getSetting = () => prisma.aiSetting.findUnique({ where: { id: "global" } });

export const settingConfig = (s: Pick<AiSetting, "providerKind" | "providerBaseUrl" | "providerModel" | "providerKeyEnc">): ProviderConfig => ({
  kind: s.providerKind === "anthropic" ? "anthropic" : "openai_compatible", baseUrl: s.providerBaseUrl, model: s.providerModel, apiKeyEnc: s.providerKeyEnc,
});

export const settingView = (s: AiSetting): AiSettingView => ({
  provider: { kind: s.providerKind === "anthropic" ? "anthropic" : "openai_compatible", baseUrl: s.providerBaseUrl ?? "", model: s.providerModel, apiKeyHint: s.providerKeyHint },
  summaryEnabled: s.summaryEnabled, summaryHour: s.summaryHour, includeProjects: s.includeProjects, monthlyBudget: s.monthlyBudget,
  priceInput: s.priceInput, priceCachedInput: s.priceCachedInput, priceOutput: s.priceOutput, currency: s.currency,
  updatedAt: s.updatedAt.toISOString(), updatedBy: s.updatedBy,
});

export class MissingKeyError extends Error { constructor() { super("API key penyedia AI wajib diisi"); } }

/** Saves the settings. An empty API key keeps the stored one (required the first time). */
export async function saveSetting(input: AiSettingInput, username: string) {
  const existing = await getSetting();
  const p = input.provider;
  if (!p.apiKey && !existing?.providerKeyEnc) throw new MissingKeyError();
  const data = {
    providerKind: p.kind, providerBaseUrl: p.kind === "openai_compatible" ? p.baseUrl || null : null, providerModel: p.model,
    ...(p.apiKey ? { providerKeyEnc: encryptSecret(p.apiKey), providerKeyHint: secretHint(p.apiKey) } : {}),
    summaryEnabled: input.summaryEnabled, summaryHour: input.summaryHour, includeProjects: input.includeProjects, monthlyBudget: input.monthlyBudget,
    priceInput: input.priceInput, priceCachedInput: input.priceCachedInput, priceOutput: input.priceOutput, currency: input.currency, updatedBy: username,
  };
  return prisma.aiSetting.upsert({
    where: { id: "global" },
    create: { id: "global", ...data, providerKeyEnc: data.providerKeyEnc ?? "", providerKeyHint: data.providerKeyHint ?? "" },
    update: data,
  });
}

// ---------------------------------------------------------------- usage log

/** Calls the provider and logs tokens, estimated cost and outcome, whether or not the reply is usable. */
export async function loggedCall(setting: AiSetting, purpose: "summary" | "report" | "test", scope: { id: string; name: string } | null, system: string, user: string, maxTokens?: number) {
  let usage: CallUsage = { input: 0, cached: 0, output: 0 };
  const started = Date.now();
  const log = (ok: boolean, error: string | null) => prisma.aiUsageLog.create({
    data: {
      purpose, scope: scope?.id ?? null, scopeName: scope?.name ?? null, model: setting.providerModel,
      inputTokens: usage.input, cachedTokens: usage.cached, outputTokens: usage.output,
      cost: callCost(usage, setting), currency: setting.currency, ok, error, ms: Date.now() - started,
    },
  }).catch((e) => console.warn("[ai-summary] log failed:", (e as Error).message));
  try {
    const raw = await completeJson(settingConfig(setting), system, user, (u) => { usage = u; }, maxTokens);
    return { raw, log, usage, ms: Date.now() - started };
  } catch (error) {
    await log(false, providerErrorMessage(error));
    throw error;
  }
}

/** Short end-to-end check of the stored provider (or an unsaved one), logged like any call. */
export async function testSetting(setting: AiSetting) {
  const { raw, log, usage, ms } = await loggedCall(setting, "test", null,
    "Anda adalah asisten uji koneksi. Jawab hanya dengan JSON berbentuk {\"ok\": true, \"pesan\": string}.",
    "Tulis satu kalimat pendek dalam bahasa Indonesia yang menyatakan koneksi berhasil.", 400);
  await log(true, null);
  const pesan = typeof raw === "object" && raw && "pesan" in raw ? String((raw as { pesan: unknown }).pesan).slice(0, 200) : "";
  return { ok: true, ms, message: pesan, cost: callCost(usage, setting), currency: setting.currency };
}

export async function monthCost() {
  const r = await prisma.aiUsageLog.aggregate({ where: { at: { gte: monthStart() } }, _sum: { cost: true } });
  return r._sum.cost ?? 0;
}

// ---------------------------------------------------------------- writing summaries

/** The scope's latest good summary before `day`, so the model can tell new issues from continuing ones. */
async function previousSummary(scope: string, day: string): Promise<PreviousSummary | null> {
  const row = await prisma.aiSummary.findFirst({ where: { scope, status: "ok", day: { lt: day } }, orderBy: { day: "desc" } });
  const content = row?.content ? summaryContentSchema.safeParse(row.content) : null;
  return content?.success ? { day: row!.day, headline: content.data.headline, highlights: content.data.highlights.map((h) => h.title) } : null;
}

type ScopeRef = { id: string; name: string; scope: KeyScope | undefined; keywords: string[] };

export async function resolveScope(id: string): Promise<ScopeRef | null> {
  if (id === BANK_SCOPE) return { id, name: BANK_NAME, scope: undefined, keywords: [] };
  const key = await prisma.apiKey.findFirst({ where: { id, revokedAt: null }, select: { id: true, name: true, scope: true, keywords: true } });
  return key ? { id: key.id, name: key.name, scope: parseKeyScope(key.scope, key.keywords), keywords: key.keywords } : null;
}

/** Writes (or rewrites) the summary of one complete data day (default: yesterday) for one scope. Never throws: failures are stored on the row. */
export async function writeSummary(setting: AiSetting, ref: ScopeRef, day = dataDay()) {
  const prior = await prisma.aiSummary.findUnique({ where: { scope_day: { scope: ref.id, day } }, select: { attempts: true } });
  let attempts = (prior?.attempts ?? 0) + 1;
  const save = (data: { status: string; content?: SummaryContent; error?: string | null }) => prisma.aiSummary.upsert({
    where: { scope_day: { scope: ref.id, day } },
    create: { scope: ref.id, scopeName: ref.name, day, model: setting.providerModel, attempts, ...data, content: data.content as Prisma.InputJsonValue },
    update: { scopeName: ref.name, model: setting.providerModel, attempts, ...data, content: data.content as Prisma.InputJsonValue },
  });
  try {
    const input = await buildInput(ref.scope, ref.name, ref.keywords, day, await previousSummary(ref.id, day));
    if (!input) {
      // Nothing to read: no provider call, no cost, and no retry for this day.
      attempts = MAX_ATTEMPTS;
      return save({ status: "failed", error: "Tidak ada data pada hari itu untuk cakupan ini." });
    }
    const { raw, log } = await loggedCall(setting, "summary", { id: ref.id, name: ref.name }, SYSTEM_PROMPT, input.text, 8000);
    const parsed = summaryContentSchema.safeParse(raw);
    if (!parsed.success) {
      await log(false, "Jawaban model tidak sesuai format");
      return save({ status: "failed", error: "Jawaban model tidak sesuai format ringkasan" });
    }
    await log(true, null);
    return save({ status: "ok", content: withSources(parsed.data, input.refs), error: null });
  } catch (error) {
    const message = providerErrorMessage(error);
    console.warn(`[ai-summary] ${ref.name}: ${message}`);
    return save({ status: "failed", error: message });
  }
}

/** Scopes that get a daily summary: the bank, plus every active key when enabled. */
async function dailyScopes(setting: AiSetting): Promise<ScopeRef[]> {
  const bank = (await resolveScope(BANK_SCOPE))!;
  if (!setting.includeProjects) return [bank];
  const keys = await prisma.apiKey.findMany({ where: { revokedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, scope: true, keywords: true } });
  return [bank, ...keys.map((k) => ({ id: k.id, name: k.name, scope: parseKeyScope(k.scope, k.keywords), keywords: k.keywords }))];
}

/** Called every worker tick: once the hour has come, writes yesterday's missing (or retryable failed) summaries, one at a time. */
export async function runDailySummaries() {
  const setting = await getSetting();
  if (!setting?.summaryEnabled || !setting.providerKeyEnc || jakartaHour() < setting.summaryHour) return 0;
  const day = dataDay();
  const scopes = await dailyScopes(setting);
  const done = new Map((await prisma.aiSummary.findMany({ where: { day, scope: { in: scopes.map((s) => s.id) } }, select: { scope: true, status: true, attempts: true, updatedAt: true } }))
    .map((r) => [r.scope, r]));
  const due = scopes.filter((s) => {
    const row = done.get(s.id);
    return !row || (row.status === "failed" && row.attempts < MAX_ATTEMPTS && Date.now() - row.updatedAt.getTime() > RETRY_MS);
  });
  let written = 0;
  for (const ref of due) {
    if (setting.monthlyBudget != null && (await monthCost()) >= setting.monthlyBudget) {
      console.warn(`[ai-summary] batas biaya bulanan ${setting.currency} ${setting.monthlyBudget} tercapai; ringkasan ditunda.`);
      break;
    }
    await writeSummary(setting, ref, day);
    written++;
  }
  return written;
}
