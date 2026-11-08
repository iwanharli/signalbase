// Background AI categorisation. Each tick, for every enabled classifier, it first labels items
// newer than anything seen so far, then keeps walking back through older items until the whole
// scope is labelled. Progress is stored as cursors, so the worker can stop and resume at any time.
import type { Prisma } from "@prisma/client";
import { categoriesForType, categorySchema, type Category } from "@/lib/ai/classifier";
import { allowsType, parseKeyScope, type KeyScope } from "@/lib/media/keyScope";
import { MEDIA_TYPES, type MediaItem, type MediaType } from "@/lib/media/types";
import { fetchItemsByCode, listItemsFromCursor, type TimeCursor } from "../bank";
import { limitsFor } from "@/lib/plans";
import { aiQuota, platformPostsThisMonth } from "./platform";

const QUOTA_REACHED = "Kuota kategorisasi Signalbase AI bulan ini habis. Pelabelan berlanjut bulan depan, setelah menambah kuota, atau setelah paket dinaikkan.";
import { prisma } from "../db";
import { fallbackConfig, providerConfig } from "./admin";
import { snapshotIfDue, spendingStop } from "./balance";
import { classifyBatch, providerErrorMessage, type ProviderConfig, type TokenCount } from "./providers";

const BATCH_SIZE = 20;
/** Batches per classifier per tick, so one large backfill can't starve the other keys. */
const MAX_BATCHES_PER_TICK = 5;

type TypeCursors = { newest?: TimeCursor; oldest?: TimeCursor; backfillDone?: boolean; sweptAt?: number; rejected?: string[]; rejectedSince?: number };
/** Most rejected item codes remembered per type (newest kept), so the sweep doesn't retry them forever. */
const MAX_REJECTED = 1_000;
/** Rejections are often transient (provider 500s), so the list is cleared and retried after this long. */
const REJECTED_TTL_MS = 6 * 3_600_000;
/** Failed provider calls allowed per run before giving up until the next tick (the provider is struggling). */
const MAX_FAILED_CALLS = 8;

// Late arrivals: the source can store a post hours after its publish time, behind the forward cursor.
// Every SWEEP_EVERY_MS the worker rescans the last SWEEP_WINDOW_MS for items still without a label.
const SWEEP_EVERY_MS = 10 * 60_000;
const SWEEP_WINDOW_MS = 3 * 24 * 3_600_000;
/** Most items read from the source per sweep, so a sweep stays cheap. */
const SWEEP_SCAN_LIMIT = 3_000;
type Cursors = Partial<Record<MediaType, TypeCursors>>;

const todayInJakarta = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

const itemText = (item: MediaItem) => [item.title, item.content].filter(Boolean).join("\n").trim();

type Job = {
  apiKeyId: string;
  scope: KeyScope;
  provider: ProviderConfig & { model: string };
  /** Tried for a batch when the main provider fails it. */
  fallback: ProviderConfig | null;
  prompt: string;
  categories: Record<MediaType, Category[]>;
  /** Backfill stops at items published before this. */
  startFrom: Date | null;
  /** Item codes the provider refused this run, per type. */
  rejected: Record<MediaType, string[]>;
  failedCalls: number;
  /** Signalbase AI with a monthly quota: posts the bank analysis marks "exclude" (not relevant) are not labelled. */
  skipExcluded?: boolean;
};

/** Errors that stop the whole run (bad key, no credit, rate limit), as opposed to a batch the provider rejects. */
const isFatal = (error: unknown) => /\((401|402|403|429)\)|tidak valid|tidak punya akses|Batas pemakaian|Base URL/i.test(providerErrorMessage(error));

/**
 * Some providers reject a batch because of one item (content filter, a 500, an empty reply). Split it in
 * halves until the bad items are isolated; those are left out (counted as skipped), the rest are labelled.
 */
type Labelled = Awaited<ReturnType<typeof classifyBatch>>[number] & { model: string };

/** Adds a request's tokens to this hour's total for the key and model. Never fails the batch. */
function recordTokens(apiKeyId: string, model: string) {
  return (u: TokenCount) => {
    const hour = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000);
    prisma.tokenUsage.upsert({
      where: { apiKeyId_hour_model: { apiKeyId, hour, model } },
      create: { apiKeyId, hour, model, inputTokens: u.input, outputTokens: u.output, calls: 1 },
      update: { inputTokens: { increment: u.input }, outputTokens: { increment: u.output }, calls: { increment: 1 } },
    }).catch(() => {});
  };
}

async function classifySplitting(job: Job, type: MediaType, items: { id: string; text: string }[]): Promise<Labelled[]> {
  if (!items.length) return [];
  try {
    return (await classifyBatch(job.provider, job.prompt, job.categories[type], items, recordTokens(job.apiKeyId, job.provider.model))).map((r) => ({ ...r, model: job.provider.model }));
  } catch (error) {
    // The fallback takes the whole batch first; only if it fails too is the batch split.
    if (job.fallback) {
      try {
        return (await classifyBatch(job.fallback, job.prompt, job.categories[type], items, recordTokens(job.apiKeyId, job.fallback.model))).map((r) => ({ ...r, model: job.fallback!.model }));
      } catch (fallbackError) {
        console.warn(`[classifier] cadangan gagal: ${providerErrorMessage(fallbackError)}`);
      }
    }
    if (isFatal(error)) throw error;
    if (++job.failedCalls > MAX_FAILED_CALLS) throw error;
    if (items.length === 1) {
      console.warn(`[classifier] ${type}/${items[0].id} dilewati: ${providerErrorMessage(error)}`);
      job.rejected[type].push(items[0].id);
      return [];
    }
    const mid = Math.ceil(items.length / 2);
    return [...await classifySplitting(job, type, items.slice(0, mid)), ...await classifySplitting(job, type, items.slice(mid))];
  }
}

/** Classifies one batch and stores the results. Returns how many items were labelled. */
async function processBatch(job: Job, type: MediaType, items: MediaItem[]) {
  const classifiable = items.filter((i) => itemText(i) && !(job.skipExcluded && i.analysis?.relevance === "exclude"));
  const results = await classifySplitting(job, type, classifiable.map((i) => ({ id: i.code, text: itemText(i) })));
  const publishedAt = new Map(items.map((i) => [i.code, new Date(i.publishedAt)]));
  await prisma.classification.createMany({
    data: results.map((r) => ({
      apiKeyId: job.apiKeyId, type, code: r.id, category: r.category, confidence: r.confidence, reason: r.reason,
      publishedAt: publishedAt.get(r.id)!, model: r.model,
    })),
    skipDuplicates: true,
  });
  return { labelled: results.length, skipped: items.length - results.length };
}

/** Runs up to `budget` items for one classifier. */
type ClassifierRow = NonNullable<Awaited<ReturnType<typeof loadClassifier>>>;
const loadClassifier = (apiKeyId: string) => prisma.classifier.findUnique({ where: { apiKeyId }, include: { apiKey: true } });

function buildJob(row: ClassifierRow): Job {
  const categories = Object.fromEntries(MEDIA_TYPES.map((t) => [t, categorySchema.array().parse(categoriesForType(row, t))])) as Record<MediaType, Category[]>;
  return {
    apiKeyId: row.apiKeyId,
    scope: parseKeyScope(row.apiKey.scope, row.apiKey.keywords),
    provider: providerConfig(row),
    fallback: fallbackConfig(row),
    prompt: row.prompt,
    categories,
    startFrom: row.startFrom,
    rejected: { social: [], online: [] },
    failedCalls: 0,
  };
}

/**
 * Tries the items the provider refused again, now (admin "Coba lagi"). Items labelled this time leave the
 * rejected list; the rest stay on it. Returns how many were labelled and how many are still refused.
 */
export async function retryRejected(apiKeyId: string) {
  const row = await loadClassifier(apiKeyId);
  if (!row) throw new Error("Proyek ini belum memakai kategorisasi AI");
  const job = buildJob(row);
  const cursors: Cursors = (row.cursors as Cursors) ?? {};
  let labelled = 0;
  for (const type of MEDIA_TYPES) {
    const codes = cursors[type]?.rejected ?? [];
    if (!codes.length) continue;
    const items = await fetchItemsByCode(type, codes);
    for (let i = 0; i < items.length; i += BATCH_SIZE) labelled += (await processBatch(job, type, items.slice(i, i + BATCH_SIZE))).labelled;
    const done = new Set((await prisma.classification.findMany({ where: { apiKeyId, type, code: { in: codes } }, select: { code: true } })).map((r) => r.code));
    cursors[type]!.rejected = codes.filter((c) => !done.has(c));
    if (!cursors[type]!.rejected!.length) cursors[type]!.rejectedSince = undefined;
  }
  await prisma.classifier.update({ where: { apiKeyId }, data: { cursors: cursors as Prisma.InputJsonValue, processed: { increment: labelled } } });
  const remaining = MEDIA_TYPES.reduce((n, t) => n + (cursors[t]?.rejected?.length ?? 0), 0);
  return { labelled, remaining };
}

async function runClassifier(classifierId: string) {
  const row = await loadClassifier(classifierId);
  if (!row || !row.enabled || row.apiKey.revokedAt) return;
  if (await pauseIfOverBudget(row.apiKeyId, row.minBalance, row.dailyBudget, row.apiKey.name)) return;
  const platform = row.providerKind === "signalbase";

  const today = todayInJakarta();
  let todayCount = row.todayDate === today ? row.todayCount : 0;
  // No daily cap: each tick handles a fixed number of batches, so keys take turns and the pace stays steady.
  let budget = BATCH_SIZE * MAX_BATCHES_PER_TICK;
  let limitedQuota = false;
  // Signalbase AI on a user's key: stay within the plan's monthly post quota (it resumes next month or on upgrade).
  if (platform && row.apiKey.ownerId) {
    const owner = await prisma.admin.findUnique({ where: { id: row.apiKey.ownerId }, select: { plan: true } });
    const quota = await aiQuota(row.apiKey.ownerId, limitsFor(owner?.plan).aiPostsPerMonth);
    if (quota !== null) {
      const left = quota - (await platformPostsThisMonth(row.apiKey.ownerId));
      if (left <= 0) {
        await prisma.classifier.update({ where: { apiKeyId: row.apiKeyId }, data: { lastError: QUOTA_REACHED, lastRunAt: new Date() } });
        return;
      }
      budget = Math.min(budget, left);
      limitedQuota = true;
    }
  }

  const job = buildJob(row);
  job.skipExcluded = limitedQuota;
  const cursors: Cursors = (row.cursors as Cursors) ?? {};
  let processed = 0, failed = 0;
  let lastError: string | null = null;

  // Saved after every batch so the panel shows live progress; counters are deltas since the last save.
  const save = async () => {
    const [p, f] = [processed, failed];
    processed = 0; failed = 0;
    for (const t of MEDIA_TYPES) {
      if (!job.rejected[t].length) continue;
      const state = (cursors[t] ??= {});
      state.rejectedSince ??= Date.now();
      state.rejected = [...(state.rejected ?? []), ...job.rejected[t]].slice(-MAX_REJECTED);
      job.rejected[t] = [];
    }
    await prisma.classifier.update({
      where: { apiKeyId: row.apiKeyId },
      data: {
        cursors: cursors as Prisma.InputJsonValue,
        processed: { increment: p }, failed: { increment: f },
        todayCount, todayDate: today, lastError, lastRunAt: new Date(),
      },
    });
  };

  try {
    // Media types share the tick fairly: each first gets an equal part, then any unused part goes to the rest,
    // so online news fills in alongside a long social backfill instead of waiting for it.
    const types = MEDIA_TYPES.filter((t) => allowsType(job.scope, t));
    const perTick = budget;
    let remaining = perTick;
    for (const round of [0, 1]) for (const type of types) {
      if (remaining <= 0) break;
      const allotted = round === 0 ? Math.min(remaining, Math.ceil(perTick / types.length)) : remaining;
      budget = allotted;
      const state = (cursors[type] ??= {});
      if (state.rejectedSince && Date.now() - state.rejectedSince > REJECTED_TTL_MS) { state.rejected = []; state.rejectedSince = undefined; }

      // 1. Items that arrived since the newest one labelled so far.
      while (budget > 0 && state.newest) {
        const page = await listItemsFromCursor(type, job.scope, "newer", state.newest, Math.min(BATCH_SIZE, budget));
        if (!page.items.length) break;
        const { labelled, skipped } = await processBatch(job, type, page.items);
        state.newest = page.next!;
        processed += labelled; failed += skipped; todayCount += page.items.length; budget -= page.items.length;
        await save();
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
        await save();
        if (inRange.length < page.items.length) { state.backfillDone = true; break; }
      }

      // 3. Sweep: label items that reached the source late, behind the forward cursor.
      if (budget > 0 && state.newest && Date.now() - (state.sweptAt ?? 0) >= SWEEP_EVERY_MS) {
        const floor = Math.max(job.startFrom?.getTime() ?? 0, Date.now() - SWEEP_WINDOW_MS);
        let cursor: TimeCursor | null = state.newest, scanned = 0;
        while (budget > 0 && cursor && scanned < SWEEP_SCAN_LIMIT) {
          const page = await listItemsFromCursor(type, job.scope, "older", cursor, 200);
          if (!page.items.length) break;
          scanned += page.items.length;
          cursor = page.next ?? null;
          const inWindow = page.items.filter((i) => new Date(i.publishedAt).getTime() >= floor && itemText(i));
          const labelled = new Set((await prisma.classification.findMany({
            where: { apiKeyId: job.apiKeyId, type, code: { in: inWindow.map((i) => i.code) } }, select: { code: true },
          })).map((r) => r.code));
          const refused = new Set(state.rejected ?? []);
          const missing = inWindow.filter((i) => !labelled.has(i.code) && !refused.has(i.code)).slice(0, budget);
          for (let i = 0; i < missing.length; i += BATCH_SIZE) {
            const batch = missing.slice(i, i + BATCH_SIZE);
            const result = await processBatch(job, type, batch);
            processed += result.labelled; failed += result.skipped; todayCount += batch.length; budget -= batch.length;
            await save();
          }
          if (new Date(page.items.at(-1)!.publishedAt).getTime() < floor) break; // walked past the window
        }
        state.sweptAt = Date.now();
      }
      remaining -= allotted - budget;
    }
  } catch (error) {
    // Cursors only advance after a batch is stored, so the failed batch is retried next tick.
    lastError = providerErrorMessage(error);
    console.error(`[classifier] ${row.apiKey.name}: ${lastError}`);
  }
  await save();
  if (!platform) await snapshotIfDue(row.apiKeyId, providerConfig(row));
  await pauseIfOverBudget(row.apiKeyId, row.minBalance, row.dailyBudget, row.apiKey.name);
}

/** Stops a classifier whose spending guard tripped; the reason is shown on the key. */
async function pauseIfOverBudget(apiKeyId: string, minBalance: number | null, dailyBudget: number | null, name: string) {
  const reason = await spendingStop(apiKeyId, minBalance, dailyBudget);
  if (!reason) return false;
  await prisma.classifier.update({ where: { apiKeyId }, data: { enabled: false, lastError: reason } });
  console.warn(`[classifier] ${name}: ${reason}`);
  return true;
}

/** One pass over every enabled classifier. */
export async function runClassifiers() {
  const rows = await prisma.classifier.findMany({ where: { enabled: true, apiKey: { revokedAt: null } }, select: { apiKeyId: true } });
  for (const { apiKeyId } of rows) await runClassifier(apiKeyId);
  return rows.length;
}
