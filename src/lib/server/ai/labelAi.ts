// Stored AI labelling settings of a project, including its own provider key.
import type { LabelAi } from "@prisma/client";
import { labelAiProvider, type LabelAiInput, type LabelAiProviderId, type LabelAiSaved } from "@/lib/ai/labelAi";
import { keyAccess, type PanelUser } from "../auth";
import { prisma } from "../db";
import { encryptSecret, secretHint } from "../secrets";
import type { ProviderConfig } from "./providers";
import { aiPlanProblem } from "./providerPolicy";

export class LabelAiError extends Error {}

/** Why this account may not manage a project's AI labelling, or null. Only its owner and admins may. */
export async function labelAiBlocked(user: PanelUser, projectId: string) {
  return user.role !== "viewer" && (await keyAccess(user, projectId)) === "full" ? null : "Hanya pemilik proyek atau admin yang dapat mengatur AI label.";
}

/** AI labelling always uses the project's own key, so only plans that allow one may use it. */
export async function labelAiPlanProblem(user: PanelUser, model: string) {
  const problem = await aiPlanProblem(user, { provider: { kind: "openai_compatible", model }, fallback: null });
  return problem ? "Pelabelan AI dengan API key sendiri butuh paket Pro atau Instansi." : null;
}

export const publicLabelAi = (row: LabelAi): LabelAiSaved => ({
  provider: row.provider as LabelAiProviderId, model: row.model, apiKeyHint: row.keyHint, prompt: row.prompt,
  startFrom: row.startFrom?.toISOString() ?? null, enabled: row.enabled,
  updatedBy: row.updatedBy, updatedAt: row.savedAt.toISOString(),
});

/** The stored key, only for the provider it was entered for: it must never be sent to another one. */
export function storedKeyFor(row: Pick<LabelAi, "provider" | "keyEnc"> | null, provider: string) {
  if (row?.provider === provider) return row.keyEnc;
  throw new LabelAiError(row ? "Ganti penyedia: isi API key penyedia yang baru" : "Isi API key penyedia AI dulu");
}

export function labelAiConfig(provider: string, model: string, apiKeyEnc: string): ProviderConfig {
  return { kind: "openai_compatible", baseUrl: labelAiProvider(provider).baseUrl, model, apiKeyEnc };
}

export async function saveLabelAi(projectId: string, input: LabelAiInput, username: string) {
  const data = {
    provider: input.provider, model: input.model, prompt: input.prompt, startFrom: input.startFrom ? new Date(input.startFrom) : null,
    enabled: input.enabled, updatedBy: username, savedAt: new Date(),
    // A save is a person acting on whatever stopped the worker: try again right away.
    lastError: null, errorStreak: 0, retryAfter: null,
  };
  if (input.apiKey) {
    const key = { keyEnc: encryptSecret(input.apiKey), keyHint: secretHint(input.apiKey) };
    return prisma.labelAi.upsert({ where: { projectId }, create: { projectId, ...data, ...key }, update: { ...data, ...key } });
  }
  storedKeyFor(await prisma.labelAi.findUnique({ where: { projectId } }), input.provider);
  // The provider is part of the condition: a save made meanwhile must not pair its key with this provider.
  const { count } = await prisma.labelAi.updateMany({ where: { projectId, provider: input.provider }, data });
  if (!count) throw new LabelAiError("Pengaturan baru saja diubah. Muat ulang halaman, lalu simpan lagi.");
  return prisma.labelAi.findUniqueOrThrow({ where: { projectId } });
}
