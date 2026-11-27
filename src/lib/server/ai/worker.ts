// Background AI categorisation. Each tick, for every enabled classifier, it first labels items
// newer than anything seen so far, then keeps walking back through older items until the whole
// scope is labelled. Progress is stored as cursors, so the worker can stop and resume at any time.
import type { Prisma } from "@prisma/client";
import { NO_CATEGORY, categoriesForType, categorySchema, type Category } from "@/lib/ai/classifier";
import { allowsType, parseKeyScope, type KeyScope } from "@/lib/media/keyScope";
import { MEDIA_TYPES, type MediaItem, type MediaType } from "@/lib/media/types";
import { fetchItemsByCode, listItemsFromCursor, type TimeCursor } from "../bank";
import { classifierKeyHint } from "./platform";
import { aiPauseReason } from "../projectAccess";

import { prisma } from "../db";
import { fallbackConfig, providerConfig } from "./admin";
import { snapshotIfDue, spendingStop } from "./balance";
import { classifyBatch, providerErrorMessage, type ProviderConfig, type TokenCount } from "./providers";
import { localQw, localQwMin, usesLocalQw } from "./localQw";
import { providerAccount, runPool, turnGroups } from "./schedule";
import { imageTextFor, withImageCodes } from "../media/textSignals";

/** Items per AI provider request. */
const BATCH_SIZE = 20;
/** Items read from the source and sent to the local model at once: a page of 100 costs about as much as one of 20, and
 *  the local model runs 32 at a time. What it leaves goes to the provider in requests of BATCH_SIZE, one after another. */
const PAGE_SIZE = 100;
/** Batches per classifier per tick, so one large backfill can't starve the other keys. */
const MAX_BATCHES_PER_TICK = 5;
/** While a key still has history to label, it gets more batches per tick so a long backfill finishes in hours, not a day. */
const BACKFILL_BATCHES_PER_TICK = 20;
/** The extra backfill batches stop after this long, so the other keys still get their turn about once a minute. */
const BACKFILL_MAX_MS = 40_000;
/** Extra backfill time per tick shared by all keys of one provider group: a tick stays about this long however many
 *  keys there are (after it, each key only gets its normal share). */
const GROUP_BACKFILL_MS = 45_000;
/** Provider groups labelled at the same time (CLASSIFIER_PARALLEL); each group still runs its keys one by one. */
const parallelGroups = () => Math.max(1, Math.floor(Number(process.env.CLASSIFIER_PARALLEL)) || 3);

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
  /** Last 4 characters of the key paying each provider, for costs per key (AI costs page). */
  providerHint: string | null;
  fallbackHint: string | null;
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

/** Adds a request's tokens to this hour's total for the key and model, with the paying provider key's hint. Never fails the batch. */
export function recordTokens(apiKeyId: string, model: string, keyHint: string | null) {
  return (u: TokenCount) => {
    const hour = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000);
    prisma.tokenUsage.upsert({
      where: { apiKeyId_hour_model: { apiKeyId, hour, model } },
      create: { apiKeyId, hour, model, inputTokens: u.input, outputTokens: u.output, calls: 1, keyHint },
      update: { inputTokens: { increment: u.input }, outputTokens: { increment: u.output }, calls: { increment: 1 }, keyHint },
    }).catch(() => {});
  };
}

async function classifySplitting(job: Job, type: MediaType, items: { id: string; text: string }[]): Promise<Labelled[]> {
  if (!items.length) return [];
  try {
    return (await classifyBatch(job.provider, job.prompt, job.categories[type], items, recordTokens(job.apiKeyId, job.provider.model, job.providerHint))).map((r) => ({ ...r, model: job.provider.model }));
  } catch (error) {
    // The fallback takes the whole batch first; only if it fails too is the batch split.
    if (job.fallback) {
      try {
        return (await classifyBatch(job.fallback, job.prompt, job.categories[type], items, recordTokens(job.apiKeyId, job.fallback.model, job.fallbackHint))).map((r) => ({ ...r, model: job.fallback!.model }));
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

/** Classifies one batch and stores the results. Returns how many items were labelled.
 *  Items this key already has a label for are left out before the AI is called, so a wider scope or a cursor that
 *  walks the timeline again never pays twice for the same post. */
async function processBatch(job: Job, type: MediaType, items: MediaItem[]) {
  const labelled = new Set((await prisma.classification.findMany({
    where: { apiKeyId: job.apiKeyId, type, code: { in: items.map((i) => i.code) } }, select: { code: true },
  })).map((r) => r.code));
  const fresh = items.filter((i) => !labelled.has(i.code));
  if (!fresh.length) return { labelled: 0, skipped: 0, sent: 0 };
  items = fresh;
  // The text read from the items' images (media worker) goes with them: a meme's caption is often empty or only emojis.
  const images = await imageTextFor(type, items.map((i) => i.code));
  const fullText = (i: MediaItem) => [itemText(i), images.has(i.code) ? `[Teks di gambar] ${images.get(i.code)}` : ""].filter(Boolean).join("\n");
  const classifiable = items.filter((i) => fullText(i) && !(job.skipExcluded && i.analysis?.relevance === "exclude"));
  let toProvider = classifiable.map((i) => ({ id: i.code, text: fullText(i) }));
  // The local model (IndoBERT) first for keys that use it: confident results are stored, the rest go to the AI provider.
  const local: Labelled[] = [];
  if (usesLocalQw(job.apiKeyId)) {
    const allowed = new Set(job.categories[type].map((c) => c.code));
    const min = localQwMin(job.apiKeyId);
    const res = await localQw(type, toProvider);
    for (const l of res?.items ?? []) {
      if (l.confidence >= min && (allowed.has(l.category) || l.category === NO_CATEGORY)) {
        local.push({ id: l.id, category: l.category, confidence: l.confidence, reason: "IndoBERT lokal", model: res!.model });
      }
    }
    const done = new Set(local.map((l) => l.id));
    toProvider = toProvider.filter((x) => !done.has(x.id));
  }
  const fromProvider: Labelled[] = [];
  for (let i = 0; i < toProvider.length; i += BATCH_SIZE) fromProvider.push(...await classifySplitting(job, type, toProvider.slice(i, i + BATCH_SIZE)));
  const results = [...local, ...fromProvider];
  const publishedAt = new Map(items.map((i) => [i.code, new Date(i.publishedAt)]));
  await prisma.classification.createMany({
    data: results.map((r) => ({
      apiKeyId: job.apiKeyId, type, code: r.id, category: r.category, confidence: r.confidence, reason: r.reason,
      publishedAt: publishedAt.get(r.id)!, model: r.model,
    })),
    skipDuplicates: true,
  });
  return { labelled: results.length, skipped: items.length - results.length, sent: items.length };
}

/** Runs up to `budget` items for one classifier. */
type ClassifierRow = NonNullable<Awaited<ReturnType<typeof loadClassifier>>>;
export const loadClassifier = (apiKeyId: string) => prisma.classifier.findUnique({ where: { apiKeyId }, include: { apiKey: true } });

export function buildJob(row: ClassifierRow): Job {
  const categories = Object.fromEntries(MEDIA_TYPES.map((t) => [t, categorySchema.array().parse(categoriesForType(row, t))])) as Record<MediaType, Category[]>;
  return {
    apiKeyId: row.apiKeyId,
    scope: parseKeyScope(row.apiKey.scope, row.apiKey.keywords),
    provider: providerConfig(row),
    fallback: fallbackConfig(row),
    providerHint: classifierKeyHint(row),
    fallbackHint: row.fallbackKeyHint,
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
  job.scope = await withImageCodes(row.apiKeyId, job.scope); // posts matching the keywords only in their image text too
  const cursors: Cursors = (row.cursors as Cursors) ?? {};
  let labelled = 0;
  for (const type of MEDIA_TYPES) {
    const codes = cursors[type]?.rejected ?? [];
    if (!codes.length) continue;
    const items = await fetchItemsByCode(type, codes);
    for (let i = 0; i < items.length; i += PAGE_SIZE) labelled += (await processBatch(job, type, items.slice(i, i + PAGE_SIZE))).labelled;
    const done = new Set((await prisma.classification.findMany({ where: { apiKeyId, type, code: { in: codes } }, select: { code: true } })).map((r) => r.code));
    cursors[type]!.rejected = codes.filter((c) => !done.has(c));
    if (!cursors[type]!.rejected!.length) cursors[type]!.rejectedSince = undefined;
  }
  await prisma.classifier.update({ where: { apiKeyId }, data: { cursors: cursors as Prisma.InputJsonValue, processed: { increment: labelled } } });
  const remaining = MEDIA_TYPES.reduce((n, t) => n + (cursors[t]?.rejected?.length ?? 0), 0);
  return { labelled, remaining };
}

async function runClassifier(classifierId: string, groupDeadline = Infinity) {
  const row = await loadClassifier(classifierId);
  if (!row || !row.enabled || row.apiKey.revokedAt) return;
  if (await pauseIfOverBudget(row.apiKeyId, row.minBalance, row.dailyBudget, row.apiKey.name)) return;
  const platform = row.providerKind === "signalbase";

  const today = todayInJakarta();
  let todayCount = row.todayDate === today ? row.todayCount : 0;
  // No daily cap: each tick handles a fixed number of batches, so keys take turns and the pace stays steady.
  const started = Date.now();
  const normalBudget = BATCH_SIZE * MAX_BATCHES_PER_TICK;
  const scope = parseKeyScope(row.apiKey.scope, row.apiKey.keywords);
  const backfilling = MEDIA_TYPES.some((t) => allowsType(scope, t) && !(row.cursors as Cursors | null)?.[t]?.backfillDone);
  let budget = backfilling ? BATCH_SIZE * BACKFILL_BATCHES_PER_TICK : normalBudget;
  let sentThisTick = 0;
  // The normal share is always processed; only the extra part is cut off by time.
  const overtime = () => sentThisTick >= normalBudget && (Date.now() - started > BACKFILL_MAX_MS || Date.now() > groupDeadline);
  // Paused while the project has clients and none of them is active (their subscriptions ended); resumes by itself.
  const paused = await aiPauseReason(row.apiKeyId);
  if (paused) {
    if (row.lastError !== paused) await prisma.classifier.update({ where: { apiKeyId: row.apiKeyId }, data: { lastError: paused, lastRunAt: new Date() } });
    return;
  }

  const job = buildJob(row);
  job.scope = await withImageCodes(row.apiKeyId, job.scope); // posts matching the keywords only in their image text too
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
    // Media types share the tick fairly: each first gets an equal part of the items and of the backfill time (and at least
    // one backfill page), then any unused part goes to the rest, so online news fills in alongside a long social backfill
    // instead of waiting for it.
    const types = MEDIA_TYPES.filter((t) => allowsType(job.scope, t));
    const perTick = budget;
    let remaining = perTick;
    for (const round of [0, 1]) for (const type of types) {
      if (remaining <= 0) break;
      const allotted = round === 0 ? Math.min(remaining, Math.ceil(perTick / types.length)) : remaining;
      budget = allotted;
      const state = (cursors[type] ??= {});
      if (state.rejectedSince && Date.now() - state.rejectedSince > REJECTED_TTL_MS) { state.rejected = []; state.rejectedSince = undefined; }
      // A start date moved earlier must reopen the backfill. The admin save does this, but a tick that was already
      // running can write its stale cursors back over it. If the scope really has nothing older, this costs one query.
      if (state.backfillDone && job.startFrom && state.oldest && new Date(`${state.oldest.ts}Z`) > job.startFrom) state.backfillDone = false;

      // 1. Items that arrived since the newest one labelled so far.
      while (budget > 0 && state.newest) {
        const page = await listItemsFromCursor(type, job.scope, "newer", state.newest, Math.min(PAGE_SIZE, budget));
        if (!page.items.length) break;
        const { labelled, skipped, sent } = await processBatch(job, type, page.items);
        state.newest = page.next!;
        // Only items sent to the AI count against the daily quota; already-labelled ones are free.
        processed += labelled; failed += skipped; todayCount += sent; budget -= sent;
        await save();
      }

      // 2. Backfill: walk back through older items until the start date (or the end of the scope).
      const typeStarted = Date.now();
      const sliceOver = () => round === 0 && types.length > 1 && Date.now() - typeStarted > BACKFILL_MAX_MS / types.length;
      let typePages = 0;
      const guaranteed = () => round === 0 && typePages++ === 0; // each type's first backfill page in the first round
      while (budget > 0 && !state.backfillDone && (guaranteed() || (!overtime() && !sliceOver()))) {
        const page = await listItemsFromCursor(type, job.scope, "older", state.oldest ?? null, Math.min(PAGE_SIZE, budget));
        if (!page.items.length) { state.backfillDone = true; break; }
        const inRange = job.startFrom ? page.items.filter((i) => new Date(i.publishedAt) >= job.startFrom!) : page.items;
        const { labelled, skipped, sent } = inRange.length ? await processBatch(job, type, inRange) : { labelled: 0, skipped: 0, sent: 0 };
        // The very first batch starts at the present, so its newest item anchors the forward pass.
        if (!state.newest) state.newest = page.first!;
        state.oldest = page.next!;
        processed += labelled; failed += skipped; todayCount += sent; budget -= sent; sentThisTick += sent;
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
          for (let i = 0; i < missing.length; i += PAGE_SIZE) {
            const batch = missing.slice(i, i + PAGE_SIZE);
            const result = await processBatch(job, type, batch);
            processed += result.labelled; failed += result.skipped; todayCount += result.sent; budget -= result.sent;
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

let turn = 0;

/** One pass over every enabled classifier: provider groups side by side, the keys of a group in turn. */
export async function runClassifiers() {
  const rows = await prisma.classifier.findMany({
    where: { enabled: true, apiKey: { revokedAt: null } },
    select: { apiKeyId: true, providerKind: true, providerBaseUrl: true, providerKeyEnc: true },
    orderBy: { createdAt: "asc" },
  });
  const groups = turnGroups(rows, providerAccount, turn++);
  await runPool(groups, parallelGroups(), async (group) => {
    const deadline = Date.now() + GROUP_BACKFILL_MS;
    for (const { apiKeyId } of group) {
      // One key failing (database hiccup, bad settings) must not stop the others of its group.
      await runClassifier(apiKeyId, deadline).catch((error) => console.error(`[classifier] ${apiKeyId}: run failed:`, error));
    }
  });
  return rows.length;
}
