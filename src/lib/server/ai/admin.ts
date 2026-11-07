// Admin-side helpers for a key's AI categorisation: shaping rows for the panel and saving input.
import type { Classifier } from "@prisma/client";
import { NextResponse } from "next/server";
import type { ZodError } from "zod";
import type { ClassifierInput, ProviderKind } from "@/lib/ai/classifier";
import { prisma } from "../db";
import { encryptSecret, secretHint } from "../secrets";
import type { ProviderConfig } from "./providers";
import { Prisma } from "@prisma/client";
import { MEDIA_TYPES } from "@/lib/media/types";
import { categoriesForType } from "@/lib/ai/classifier";

/** A classifier as the panel sees it: the provider key itself is never returned, only its last four characters. */
export const publicClassifier = (c: Classifier) => ({
  apiKeyId: c.apiKeyId,
  provider: { kind: c.providerKind, baseUrl: c.providerBaseUrl, model: c.providerModel, apiKeyHint: c.providerKeyHint },
  enabled: c.enabled, prompt: c.prompt, categories: c.categories, onlineCategories: c.onlineCategories, labelledOnly: c.labelledOnly, minBalance: c.minBalance, dailyBudget: c.dailyBudget, startFrom: c.startFrom,
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
  const startFrom = input.startFrom ? new Date(input.startFrom) : null;
  const data = { ...provider, enabled: input.enabled, prompt: input.prompt, categories: input.categories, onlineCategories: input.onlineCategories ?? Prisma.DbNull, labelledOnly: input.labelledOnly, minBalance: input.minBalance, dailyBudget: input.dailyBudget, startFrom };

  if (!existing) {
    return prisma.classifier.create({ data: { apiKeyId, ...data, providerKeyEnc: provider.providerKeyEnc!, providerKeyHint: provider.providerKeyHint! } });
  }
  // Prompt or provider changes invalidate every result; a category list only invalidates its own media type.
  const sharedChanged = existing.prompt !== input.prompt
    || existing.providerKind !== provider.providerKind
    || existing.providerModel !== provider.providerModel
    || (existing.providerBaseUrl ?? null) !== provider.providerBaseUrl;
  const restart = MEDIA_TYPES.filter((type) => sharedChanged
    || JSON.stringify(categoriesForType(existing, type)) !== JSON.stringify(categoriesForType({ categories: input.categories, onlineCategories: input.onlineCategories }, type)));
  // An earlier start date (or "everything") reopens the backfill; existing results are kept either way.
  const reachesFurther = !!existing.startFrom && (!startFrom || startFrom < existing.startFrom);
  const old = (existing.cursors ?? {}) as Record<string, Record<string, unknown>>;
  const cursors = Object.fromEntries(MEDIA_TYPES.flatMap((type) => {
    if (restart.includes(type) || !old[type]) return [];
    return [[type, reachesFurther ? { ...old[type], backfillDone: false } : old[type]]];
  }));
  const everything = restart.length === MEDIA_TYPES.length;
  return prisma.$transaction(async (tx) => {
    let removed = 0;
    for (const type of restart) {
      // Manual corrections survive a restart while their category still exists in the new list.
      const codes = [...(categoriesForType({ categories: input.categories, onlineCategories: input.onlineCategories }, type) as { code: string }[]).map((c) => c.code), "none"];
      removed += (await tx.classification.deleteMany({ where: { apiKeyId, type, OR: [{ manual: false }, { category: { notIn: codes } }] } })).count;
    }
    return tx.classifier.update({
      where: { apiKeyId },
      data: {
        ...data, cursors: cursors as Prisma.InputJsonValue,
        // Turning it back on clears an automatic pause message.
        ...(input.enabled && !existing.enabled ? { lastError: null } : {}),
        ...(everything ? { processed: 0, failed: 0, lastError: null } : restart.length ? { processed: Math.max(0, existing.processed - removed), lastError: null } : {}),
      },
    });
  });
}

export function validationError(error: ZodError, fallback: string) {
  const issue = error.issues[0];
  return NextResponse.json({ error: issue?.message && !issue.message.startsWith("Invalid") ? issue.message : fallback }, { status: 400 });
}
