// Background AI categorisation. Each tick, for every enabled classifier, it first labels items
// newer than anything seen so far, then keeps walking back through older items until the whole
// scope is labelled. Progress is stored as cursors, so the worker can stop and resume at any time.
import type { Prisma } from "@prisma/client";
import { categoriesForType, categorySchema, type Category } from "@/lib/ai/classifier";
import { allowsType, parseKeyScope, type KeyScope } from "@/lib/media/keyScope";
import { MEDIA_TYPES, type MediaItem, type MediaType } from "@/lib/media/types";
import { listItemsFromCursor, type TimeCursor } from "../bank";
import { prisma } from "../db";
import { providerConfig } from "./admin";
import { snapshotIfDue } from "./balance";
import { classifyBatch, providerErrorMessage, type ProviderConfig } from "./providers";

const BATCH_SIZE = 20;
/** Batches per classifier per tick, so one large backfill can't starve the other keys. */
const MAX_BATCHES_PER_TICK = 5;

type TypeCursors = { newest?: TimeCursor; oldest?: TimeCursor; backfillDone?: boolean };
type Cursors = Partial<Record<MediaType, TypeCursors>>;

const todayInJakarta = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

const itemText = (item: MediaItem) => [item.title, item.content].filter(Boolean).join("\n").trim();

type Job = {
  apiKeyId: string;
  scope: KeyScope;
  provider: ProviderConfig & { model: string };
  prompt: string;
  categories: Record<MediaType, Category[]>;
  /** Backfill stops at items published before this. */
  startFrom: Date | null;
};

/** Classifies one batch and stores the results. Returns how many items were labelled. */
async function processBatch(job: Job, type: MediaType, items: MediaItem[]) {
  const classifiable = items.filter((i) => itemText(i));
  const results = await classifyBatch(job.provider, job.prompt, job.categories[type], classifiable.map((i) => ({ id: i.code, text: itemText(i) })));
  const publishedAt = new Map(items.map((i) => [i.code, new Date(i.publishedAt)]));
  await prisma.classification.createMany({
    data: results.map((r) => ({
      apiKeyId: job.apiKeyId, type, code: r.id, category: r.category, confidence: r.confidence, reason: r.reason,
      publishedAt: publishedAt.get(r.id)!, model: job.provider.model,
    })),
    skipDuplicates: true,
  });
  return { labelled: results.length, skipped: items.length - results.length };
}

/** Runs up to `budget` items for one classifier. */
async function runClassifier(classifierId: string) {
  const row = await prisma.classifier.findUnique({ where: { apiKeyId: classifierId }, include: { apiKey: true } });
  if (!row || !row.enabled || row.apiKey.revokedAt) return;

  const today = todayInJakarta();
  let todayCount = row.todayDate === today ? row.todayCount : 0;
  // No daily cap: each tick handles a fixed number of batches, so keys take turns and the pace stays steady.
  let budget = BATCH_SIZE * MAX_BATCHES_PER_TICK;

  const categories = Object.fromEntries(MEDIA_TYPES.map((t) => [t, categorySchema.array().parse(categoriesForType(row, t))])) as Record<MediaType, Category[]>;
  const job: Job = {
    apiKeyId: row.apiKeyId,
    scope: parseKeyScope(row.apiKey.scope, row.apiKey.keywords),
    provider: providerConfig(row),
    prompt: row.prompt,
    categories,
    startFrom: row.startFrom,
  };
  const cursors: Cursors = (row.cursors as Cursors) ?? {};
  let processed = 0, failed = 0;
  let lastError: string | null = null;

  const save = () => prisma.classifier.update({
    where: { apiKeyId: row.apiKeyId },
    data: {
      cursors: cursors as Prisma.InputJsonValue,
      processed: { increment: processed }, failed: { increment: failed },
      todayCount, todayDate: today, lastError, lastRunAt: new Date(),
    },
  });

  try {
    for (const type of MEDIA_TYPES) {
      if (!allowsType(job.scope, type)) continue;
      const state = (cursors[type] ??= {});

      // 1. Items that arrived since the newest one labelled so far.
      while (budget > 0 && state.newest) {
        const page = await listItemsFromCursor(type, job.scope, "newer", state.newest, Math.min(BATCH_SIZE, budget));
        if (!page.items.length) break;
        const { labelled, skipped } = await processBatch(job, type, page.items);
        state.newest = page.next!;
        processed += labelled; failed += skipped; todayCount += page.items.length; budget -= page.items.length;
      }

      // 2. Backfill: walk back through older items until the start date (or the end of the scope).
      while (budget > 0 && !state.backfillDone) {
        const page = await listItemsFromCursor(type, job.scope, "older", state.oldest ?? null, Math.min(BATCH_SIZE, budget));
        if (!page.items.length) { state.backfillDone = true; break; }
        const inRange = job.startFrom ? page.items.filter((i) => new Date(i.publishedAt) >= job.startFrom!) : page.items;
        const { labelled, skipped } = inRange.length ? await processBatch(job, type, inRange) : { labelled: 0, skipped: 0 };
        // The very first batch starts at the present, so its newest item anchors the forward pass.
        if (!state.newest) state.newest = page.first!;
        state.oldest = page.next!;
        processed += labelled; failed += skipped; todayCount += inRange.length; budget -= inRange.length;
        if (inRange.length < page.items.length) { state.backfillDone = true; break; }
      }
    }
  } catch (error) {
    // Cursors only advance after a batch is stored, so the failed batch is retried next tick.
    lastError = providerErrorMessage(error);
    console.error(`[classifier] ${row.apiKey.name}: ${lastError}`);
  }
  await save();
  await snapshotIfDue(row.apiKeyId, providerConfig(row));
}

/** One pass over every enabled classifier. */
export async function runClassifiers() {
  const rows = await prisma.classifier.findMany({ where: { enabled: true, apiKey: { revokedAt: null } }, select: { apiKeyId: true } });
  for (const { apiKeyId } of rows) await runClassifier(apiKeyId);
  return rows.length;
}
