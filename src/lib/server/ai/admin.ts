// Admin-side helpers for AI providers and classifiers (shaping rows for the panel, saving input).
import type { AiProvider, Classifier, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import type { ZodError } from "zod";
import type { ClassifierInput, ProviderInput } from "@/lib/ai/classifier";
import { prisma } from "../db";
import { encryptSecret, secretHint } from "../secrets";

/** A provider as the panel sees it: never the key itself, only its last four characters. */
export const publicProvider = (p: AiProvider) => ({
  id: p.id, name: p.name, kind: p.kind, baseUrl: p.baseUrl, model: p.model, apiKeyHint: p.apiKeyHint, createdAt: p.createdAt, updatedAt: p.updatedAt,
});

export function providerData(input: ProviderInput) {
  const data: Omit<Prisma.AiProviderUncheckedCreateInput, "apiKeyEnc" | "apiKeyHint"> & { apiKeyEnc?: string; apiKeyHint?: string } = {
    name: input.name, kind: input.kind, model: input.model,
    baseUrl: input.kind === "openai_compatible" ? input.baseUrl || null : null,
  };
  if (input.apiKey) Object.assign(data, { apiKeyEnc: encryptSecret(input.apiKey), apiKeyHint: secretHint(input.apiKey) });
  return data;
}

export const publicClassifier = (c: Classifier & { provider?: AiProvider }) => ({
  apiKeyId: c.apiKeyId, providerId: c.providerId, providerName: c.provider?.name ?? null, model: c.provider?.model ?? null,
  enabled: c.enabled, prompt: c.prompt, categories: c.categories, dailyLimit: c.dailyLimit,
  cursors: c.cursors, processed: c.processed, failed: c.failed, todayCount: c.todayCount, todayDate: c.todayDate,
  lastError: c.lastError, lastRunAt: c.lastRunAt, updatedAt: c.updatedAt,
});

/** Creates or updates a key's classifier. Changing the prompt or categories restarts labelling from scratch. */
export async function saveClassifier(apiKeyId: string, input: ClassifierInput) {
  const existing = await prisma.classifier.findUnique({ where: { apiKeyId } });
  const definitionChanged = !existing
    || existing.prompt !== input.prompt
    || JSON.stringify(existing.categories) !== JSON.stringify(input.categories)
    || existing.providerId !== input.providerId;
  const data = { providerId: input.providerId, enabled: input.enabled, prompt: input.prompt, categories: input.categories, dailyLimit: input.dailyLimit };

  if (!existing) return prisma.classifier.create({ data: { apiKeyId, ...data } });
  return prisma.$transaction(async (tx) => {
    if (definitionChanged) await tx.classification.deleteMany({ where: { apiKeyId } });
    return tx.classifier.update({
      where: { apiKeyId },
      data: { ...data, ...(definitionChanged ? { cursors: {}, processed: 0, failed: 0, lastError: null } : {}) },
    });
  });
}

export function validationError(error: ZodError, fallback: string) {
  const issue = error.issues[0];
  return NextResponse.json({ error: issue?.message && !issue.message.startsWith("Invalid") ? issue.message : fallback }, { status: 400 });
}
