// Admin-side helpers for a key's AI categorisation: shaping rows for the panel and saving input.
import type { Classifier } from "@prisma/client";
import { NextResponse } from "next/server";
import type { ZodError } from "zod";
import type { ClassifierInput, ProviderKind } from "@/lib/ai/classifier";
import { prisma } from "../db";
import { encryptSecret, secretHint } from "../secrets";
import type { ProviderConfig } from "./providers";

/** A classifier as the panel sees it: the provider key itself is never returned, only its last four characters. */
export const publicClassifier = (c: Classifier) => ({
  apiKeyId: c.apiKeyId,
  provider: { kind: c.providerKind, baseUrl: c.providerBaseUrl, model: c.providerModel, apiKeyHint: c.providerKeyHint },
  enabled: c.enabled, prompt: c.prompt, categories: c.categories,
  cursors: c.cursors, processed: c.processed, failed: c.failed, todayCount: c.todayCount, todayDate: c.todayDate,
  lastError: c.lastError, lastRunAt: c.lastRunAt, updatedAt: c.updatedAt,
});

export const providerConfig = (c: Pick<Classifier, "providerKind" | "providerBaseUrl" | "providerModel" | "providerKeyEnc">): ProviderConfig => ({
  kind: c.providerKind as ProviderKind, baseUrl: c.providerBaseUrl, model: c.providerModel, apiKeyEnc: c.providerKeyEnc,
});

export class MissingProviderKeyError extends Error {
  constructor() { super("API key penyedia AI wajib diisi"); }
}

/**
 * Creates or updates a key's classifier. A new provider key replaces the stored one; an empty one keeps it.
 * Changing the prompt, categories, provider, or model restarts labelling from scratch.
 */
export async function saveClassifier(apiKeyId: string, input: ClassifierInput) {
  const existing = await prisma.classifier.findUnique({ where: { apiKeyId } });
  if (!existing && !input.provider.apiKey) throw new MissingProviderKeyError();

  const provider = {
    providerKind: input.provider.kind,
    providerBaseUrl: input.provider.kind === "openai_compatible" ? input.provider.baseUrl || null : null,
    providerModel: input.provider.model,
    ...(input.provider.apiKey ? { providerKeyEnc: encryptSecret(input.provider.apiKey), providerKeyHint: secretHint(input.provider.apiKey) } : {}),
  };
  const data = { ...provider, enabled: input.enabled, prompt: input.prompt, categories: input.categories };

  if (!existing) {
    return prisma.classifier.create({ data: { apiKeyId, ...data, providerKeyEnc: provider.providerKeyEnc!, providerKeyHint: provider.providerKeyHint! } });
  }
  const definitionChanged = existing.prompt !== input.prompt
    || JSON.stringify(existing.categories) !== JSON.stringify(input.categories)
    || existing.providerKind !== provider.providerKind
    || existing.providerModel !== provider.providerModel
    || (existing.providerBaseUrl ?? null) !== provider.providerBaseUrl;
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
