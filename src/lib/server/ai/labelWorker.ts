// Background AI labelling ("Kustomisasi Label"), separate from AI categorisation and run by its own process
// (scripts/label-ai.ts). Each tick, per enabled project: posts newer than seen so far, then failed ones due for another
// try, then older history back to the start date, then a sweep for late arrivals. A post that gets any label is then checked
// by web search, one call each, before anything is stored. Every post sent has a row in
// LabelAiItem, so it is not paid for twice and a person's decision is never overwritten.
import type { LabelAi, Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { labelAiProvider } from "@/lib/ai/labelAi";
import { backoffMs, labelErrorKind, needsReview, parseLabelReply, reachesFurther, type AiLabel, type CheckedLabel } from "@/lib/ai/labelReply";
import { COPY_MODEL, RULE_MODEL, skipReason, textKey, type SkipReason } from "@/lib/ai/labelSkip";
import { allowsType, parseKeyScope, type KeyScope } from "@/lib/media/keyScope";
import { defaultLabelPrompt, labelOutputFormat, syncLabelList } from "@/lib/media/manualLabels";
import { MEDIA_TYPES, type MediaItem, type MediaType } from "@/lib/media/types";
import { fetchItemsByCode, listItemsFromCursor, type TimeCursor } from "../bank";
import { prisma } from "../db";
import { imageTextFor, withImageCodes } from "../media/textSignals";
import { aiPauseReason } from "../projectAccess";
import { labelAiConfig } from "./labelAi";
import { checkSources, searchSystem } from "./labelSearch";
import { completeJson, providerErrorMessage, type CallUsage } from "./providers";
import { providerAccount, runPool, turnGroups } from "./schedule";

const BATCH_SIZE = 20;
/** Most posts sent per project per tick, so one backfill can't hold up the others. */
const TICK_BUDGET = 100;
const MAX_ATTEMPTS = 3;
const RETRY_MS = 30 * 60_000;
/** Posts without text yet (image text arrives later) are looked at again hourly, for about three days. */
const TEXT_RETRY_MS = 3_600_000;
const MAX_TEXT_CHECKS = 72;
const MAX_FAILED_CALLS = 8;
const SWEEP_EVERY_MS = 10 * 60_000;
const SWEEP_WINDOW_MS = 3 * 24 * 3_600_000;
const SWEEP_SCAN_LIMIT = 3_000;
const MAX_ITEM_CHARS = 1_500;
const MAX_REPLY_TOKENS = 16_000;
const PARALLEL_ACCOUNTS = 2;

type TypeState = { newest?: TimeCursor; oldest?: TimeCursor; backfillDone?: boolean; walkedFrom?: string | null; sweptAt?: number };
type Cursors = Partial<Record<MediaType, TypeState>>;

const clock = () => new Date().toLocaleString("sv-SE", { timeZone: "Asia/Jakarta" });
/** One terminal line. Never pass post text or keys. */
export const log = (message: string) => console.log(`${clock()} [label-ai] ${message}`);
const num = (n: number) => n.toLocaleString("id-ID");
const TYPE_NAMES: Record<MediaType, string> = { social: "medsos", online: "berita" };

/** Why a project is idle, last printed per project: repeated only when it changes, not every minute. */
const quiet = new Map<string, string>();
function logIdle(projectId: string, name: string, reason: string) {
  if (quiet.get(projectId) === reason) return;
  quiet.set(projectId, reason);
  log(`${name}: ${reason}`);
}

/** A person saved the settings while this run was going: stop, so no more is spent under the old ones. */
class Changed extends Error {}

/** Stops a project's run: paused for a person, or waiting before the next try. */
class Halt extends Error {
  constructor(readonly kind: "pause" | "wait", message: string) { super(message); }
}

/** Records a call's tokens for the panel and for the terminal summary. */
function usageOf(run: Run) {
  const record = recordUsage(run.row.projectId, run.row.model);
  return (u: CallUsage) => { run.tally.calls++; run.tally.input += u.input; run.tally.output += u.output; record(u); };
}

type Run = {
  row: LabelAi;
  /** Project name, for the terminal. */
  name: string;
  scope: KeyScope;
  options: string[];
  system: string;
  /** Instructions of the source check. */
  checkSystem: string;
  /** Posts that may still be sent in this tick (tick share and daily limit). */
  budget: number;
  today: string;
  todayCount: number;
  failedCalls: number;
  succeeded: boolean;
  /** What this run did, for the terminal summary. */
  tally: { sent: number; labelled: number; empty: number; failed: number; waiting: number; human: number; calls: number; input: number; output: number;
    /** Passed over by a rule (labelSkip) / copied from the same text, both without a call. */
    skipped: number; copied: number };
};

const todayInJakarta = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
const itemKey = (projectId: string, type: MediaType, code: string) => ({ projectId_type_code: { projectId, type, code } });

function recordUsage(projectId: string, model: string) {
  return (u: CallUsage) => {
    const hour = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000);
    const check = u.searches === undefined
      ? { checkInputTokens: 0, checkCachedTokens: 0, checkOutputTokens: 0, searches: 0 }
      : { checkInputTokens: u.input, checkCachedTokens: u.cached, checkOutputTokens: u.output, searches: u.searches };
    prisma.labelAiUsage.upsert({
      where: { projectId_hour_model: { projectId, hour, model } },
      create: { projectId, hour, model, inputTokens: u.input, cachedTokens: u.cached, outputTokens: u.output, calls: 1, ...check },
      update: { inputTokens: { increment: u.input }, cachedTokens: { increment: u.cached }, outputTokens: { increment: u.output }, calls: { increment: 1 },
        checkInputTokens: { increment: check.checkInputTokens }, checkCachedTokens: { increment: check.checkCachedTokens },
        checkOutputTokens: { increment: check.checkOutputTokens }, searches: { increment: check.searches },
      },
    }).catch(() => {});
  };
}

/** How a result came about, kept with each AI label in `additionalData` beside its reason. */
export type ResultMeta = {
  provider: string;
  model: string;
  labeledAt: string;
  /** Short hash of the full instructions sent, to tell results of different prompts apart. */
  promptVersion: string;
  customPrompt: boolean;
  /** What the model was given: which parts of the post, and whether its text was cut. */
  input?: { parts: string[]; characters: number; truncated: boolean };
  /** Whether a web search ran for this post, and what was searched. */
  webSearch: boolean;
  searchQueries: string[];
};

/**
 * Stores one post's AI result. The ledger row is taken first, inside the same transaction: a person labelling the post
 * meanwhile writes that row too (item-labels route), so whichever comes second sees the other. Returns false when the
 * post was already decided.
 */
export async function storeResult(projectId: string, type: MediaType, code: string, publishedAt: Date, labels: CheckedLabel[], meta: ResultMeta, key: string | null = null) {
  const { model } = meta;
  return prisma.$transaction(async (tx) => {
    const done = { status: labels.length ? "done" : "empty", model, publishedAt, error: null, retryAfter: null, textKey: key };
    const created = await tx.labelAiItem.createMany({ data: [{ projectId, type, code, attempts: 1, ...done }], skipDuplicates: true });
    if (!created.count) {
      const taken = await tx.labelAiItem.updateMany({ where: { projectId, type, code, status: { in: ["failed", "waiting_text"] } }, data: done });
      if (!taken.count) return false;
    }
    // Labels a person gave before this ledger existed.
    if (await tx.itemLabel.count({ where: { projectId, type, code } })) {
      await tx.labelAiItem.update({ where: itemKey(projectId, type, code), data: { status: "human" } });
      return false;
    }
    // The choices may have changed while the model was answering.
    const { manualLabels } = await tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { manualLabels: true } });
    await tx.itemLabel.createMany({
      data: labels.filter((l) => manualLabels.includes(l.label)).map((l) => ({
        projectId, type, code, label: l.label, setBy: "AI", source: "ai", score: l.score,
        additionalData: { reason: l.reason, needsReview: needsReview(l), disputed: l.disputed, sources: l.sources, ...meta },
      })),
      skipDuplicates: true,
    });
    return true;
  });
}

/** Takes the ledger row for a post decided without the model (a rule or a copy). False: already decided (a person, or
 *  an earlier run). */
async function takeLedger(tx: Prisma.TransactionClient, projectId: string, type: MediaType, code: string, data: { status: string; model: string; publishedAt: Date; textKey: string | null }) {
  const done = { ...data, error: null, retryAfter: null };
  const created = await tx.labelAiItem.createMany({ data: [{ projectId, type, code, attempts: 1, ...done }], skipDuplicates: true });
  if (!created.count && !(await tx.labelAiItem.updateMany({ where: { projectId, type, code, status: { in: ["failed", "waiting_text"] } }, data: done })).count) return false;
  if (await tx.itemLabel.count({ where: { projectId, type, code } })) {
    await tx.labelAiItem.update({ where: itemKey(projectId, type, code), data: { status: "human" } });
    return false;
  }
  return true;
}

/** A post the model need not read (labelSkip): recorded as checked, no label, no call. */
const storeSkip = (projectId: string, type: MediaType, item: { code: string; publishedAt: Date }, reason: SkipReason, key: string | null) =>
  prisma.$transaction((tx) => takeLedger(tx, projectId, type, item.code, { status: "empty", model: RULE_MODEL(reason), publishedAt: item.publishedAt, textKey: key }));

/** A copy of a post already checked: its result (labels with their scores and reasons) without a call. */
async function storeCopy(projectId: string, type: MediaType, item: { code: string; publishedAt: Date }, key: string, from: { code: string; status: string }) {
  return prisma.$transaction(async (tx) => {
    if (!(await takeLedger(tx, projectId, type, item.code, { status: from.status, model: COPY_MODEL, publishedAt: item.publishedAt, textKey: key }))) return false;
    const labels = await tx.itemLabel.findMany({ where: { projectId, type, code: from.code, source: "ai" } });
    await tx.itemLabel.createMany({
      data: labels.map((l) => ({ projectId, type, code: item.code, label: l.label, setBy: "AI", source: "ai", score: l.score,
        additionalData: { ...(l.additionalData as object | null), copiedFrom: from.code } })),
      skipDuplicates: true,
    });
    return true;
  });
}

/** Records a post that got no result: tried again later, up to the attempt limit. */
async function storeMiss(projectId: string, type: MediaType, item: { code: string; publishedAt: Date }, status: "failed" | "waiting_text", error: string | null) {
  const retryAfter = new Date(Date.now() + (status === "failed" ? RETRY_MS : TEXT_RETRY_MS));
  const created = await prisma.labelAiItem.createMany({
    data: [{ projectId, type, code: item.code, publishedAt: item.publishedAt, status, attempts: 1, retryAfter, error }], skipDuplicates: true,
  });
  if (!created.count) {
    await prisma.labelAiItem.updateMany({
      where: { projectId, type, code: item.code, status: { in: ["failed", "waiting_text"] } },
      data: { status, retryAfter, error, attempts: { increment: 1 } },
    });
  }
}

type Sendable = { code: string; text: string; publishedAt: Date; input: NonNullable<ResultMeta["input"]>; key: string | null };

/** One provider call for these posts; each result is stored at once. A rejected or garbled batch is split. */
async function send(run: Run, type: MediaType, posts: Sendable[]): Promise<void> {
  if (!posts.length) return;
  const { row } = run;
  let results: Map<string, AiLabel[]>;
  // Counted before the call: a failed call may be billed too.
  run.todayCount += posts.length;
  run.budget -= posts.length;
  await prisma.labelAi.update({ where: { projectId: row.projectId }, data: { todayDate: run.today, todayCount: run.todayCount, lastRunAt: new Date() } });
  const startedAt = Date.now();
  const where = `${run.name} · ${TYPE_NAMES[type]}`;
  const seconds = () => `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
  log(`${where}: mengirim ${posts.length} post ke ${row.model}…`);
  try {
    const reply = await completeJson(
      labelAiConfig(row.provider, row.model, row.keyEnc), run.system,
      JSON.stringify({ items: posts.map((p) => ({ id: p.code, text: p.text })) }),
      usageOf(run), MAX_REPLY_TOKENS,
      // DeepSeek thinks by default, and thinking is billed as output.
      labelAiProvider(row.provider).id === "deepseek" ? { thinking: { type: "disabled" } } : {},
    );
    results = parseLabelReply(reply, posts.map((p) => p.code), run.options);
    if (!results.size) throw new Error("Jawaban AI tidak sesuai format yang diminta");
  } catch (error) {
    const message = providerErrorMessage(error);
    const kind = labelErrorKind(message);
    log(`${where}: panggilan gagal (${seconds()}): ${message}`);
    if (kind !== "batch") throw new Halt(kind, message);
    if (++run.failedCalls > MAX_FAILED_CALLS) throw new Halt("wait", message);
    if (posts.length === 1) {
      // With nothing succeeding and no sign it is only this post, don't blame it yet: wait and try again.
      if (!run.succeeded && row.errorStreak < 2) throw new Halt("wait", message);
      await storeMiss(row.projectId, type, posts[0], "failed", message);
      run.tally.failed++;
      log(`${where}: post ${posts[0].code} dicatat gagal`);
      return;
    }
    const mid = Math.ceil(posts.length / 2);
    log(`${where}: batch dipecah menjadi ${mid} + ${posts.length - mid} post`);
    await send(run, type, posts.slice(0, mid));
    await send(run, type, posts.slice(mid));
    return;
  }
  run.succeeded = true;
  const matched: { post: Sendable; labels: AiLabel[] }[] = [];
  let empty = 0, missed = 0, skipped = 0;
  for (const post of posts) {
    const labels = results.get(post.code);
    if (!labels) {
      await storeMiss(row.projectId, type, post, "failed", "AI tidak menjawab post ini dengan benar");
      await count(run, 0, 1);
      missed++;
    } else if (labels.length) matched.push({ post, labels });
    // Nothing to support, so nothing to search for.
    else if (await save(run, type, post, [], false, [])) empty++;
    else skipped++;
  }
  run.tally.sent += posts.length;
  run.tally.empty += empty;
  run.tally.failed += missed;
  run.tally.human += skipped;
  log(`${where}: penyaringan ${seconds()} → ${matched.length} perlu cek sumber, ${empty} tanpa label cocok${missed ? `, ${missed} gagal` : ""}${skipped ? `, ${skipped} dilewati (diputuskan orang)` : ""}`);
  for (const [i, { post, labels }] of matched.entries()) await check(run, type, post, labels, `${where}: cek sumber ${i + 1}/${matched.length}`);
}

const count = (run: Run, processed: number, failed: number) => prisma.labelAi.update({
  where: { projectId: run.row.projectId }, data: { processed: { increment: processed }, failed: { increment: failed }, lastRunAt: new Date() },
});

/** Stores one post's labels with how they came about, and counts it. False: a person decided this post meanwhile. */
async function save(run: Run, type: MediaType, post: Sendable, labels: CheckedLabel[], webSearch: boolean, searchQueries: string[]) {
  const { row } = run;
  const stored = await storeResult(row.projectId, type, post.code, post.publishedAt, labels, {
    provider: row.provider, model: row.model, labeledAt: new Date().toISOString(),
    promptVersion: createHash("sha256").update(run.system + run.checkSystem).digest("hex").slice(0, 12),
    customPrompt: row.prompt !== null, input: post.input, webSearch, searchQueries,
  }, post.key);
  if (stored) await count(run, 1, 0);
  return stored;
}

/** The source check of one labelled post. Its labels are stored only if a search ran and the answer holds up. */
async function check(run: Run, type: MediaType, post: Sendable, candidates: AiLabel[], where: string) {
  const { row } = run;
  // Searches take seconds each: a pause or a new setting takes effect before the next one.
  const current = await prisma.labelAi.findUnique({ where: { projectId: row.projectId }, select: { enabled: true, savedAt: true } });
  if (!current?.enabled || current.savedAt.getTime() !== row.savedAt.getTime()) throw new Changed();
  const startedAt = Date.now();
  const seconds = () => `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
  let checked: Awaited<ReturnType<typeof checkSources>>;
  try {
    checked = await checkSources(labelAiConfig(row.provider, row.model, row.keyEnc), run.checkSystem, post.text, candidates, usageOf(run));
  } catch (error) {
    const message = providerErrorMessage(error);
    const kind = labelErrorKind(message);
    log(`${where}: gagal (${seconds()}): ${message}`);
    if (kind !== "batch") throw new Halt(kind, message);
    if (++run.failedCalls > MAX_FAILED_CALLS) throw new Halt("wait", message);
    await storeMiss(row.projectId, type, post, "failed", message);
    await count(run, 0, 1);
    run.tally.failed++;
    return;
  }
  if (!(await save(run, type, post, checked.labels, true, checked.queries))) {
    run.tally.human++;
    log(`${where}: dilewati, sudah diputuskan orang`);
    return;
  }
  if (checked.labels.length) run.tally.labelled++;
  else run.tally.empty++;
  const described = checked.labels.map((l) => `${l.label} ${l.score}% (${l.sources.length} sumber${needsReview(l) ? ", periksa" : ""})`).join("; ");
  log(`${where}: selesai ${seconds()} → ${described || "label dibatalkan setelah diperiksa"}`);
}

/** Labels the posts of one page that still need it. Returns only when every one of them has been recorded. */
async function processItems(run: Run, type: MediaType, items: MediaItem[]) {
  const projectId = run.row.projectId;
  const codes = items.map((i) => i.code);
  const [ledger, labelled] = await Promise.all([
    prisma.labelAiItem.findMany({ where: { projectId, type, code: { in: codes } }, select: { code: true, status: true, attempts: true, retryAfter: true } }),
    prisma.itemLabel.findMany({ where: { projectId, type, code: { in: codes } }, select: { code: true } }),
  ]);
  const seen = new Map(ledger.map((r) => [r.code, r]));
  const hasLabels = new Set(labelled.map((r) => r.code));
  const due = items.filter((i) => {
    const r = seen.get(i.code);
    if (!r) return !hasLabels.has(i.code);
    const limit = r.status === "failed" ? MAX_ATTEMPTS : r.status === "waiting_text" ? MAX_TEXT_CHECKS : 0;
    return r.attempts < limit && (!r.retryAfter || r.retryAfter.getTime() <= Date.now());
  });
  if (!due.length) return;
  const images = await imageTextFor(type, due.map((i) => i.code));
  const posts: Sendable[] = [];
  // Copies of posts already checked take their result (same text fingerprint, see lib/ai/labelSkip).
  const texts = new Map(due.map((item) => [item.code, [item.title, item.content, images.get(item.code)].filter((p) => p?.trim()).join("\n").trim()]));
  const keys = new Map([...texts].map(([code, text]) => [code, textKey(text)]));
  const wanted = [...new Set([...keys.values()].filter((k): k is string => !!k))];
  const originals = new Map((wanted.length ? await prisma.labelAiItem.findMany({
    where: { projectId, type, textKey: { in: wanted }, status: { in: ["done", "empty"] }, model: { not: COPY_MODEL } },
    select: { code: true, status: true, textKey: true }, orderBy: { createdAt: "asc" },
  }) : []).map((r) => [r.textKey!, r]));
  for (const item of due) {
    const all = texts.get(item.code) ?? "";
    const key = keys.get(item.code) ?? null;
    const publishedAt = new Date(item.publishedAt);
    const original = key ? originals.get(key) : undefined;
    if (all && original && original.code !== item.code) {
      if (await storeCopy(projectId, type, { code: item.code, publishedAt }, key!, original)) { await count(run, 1, 0); run.tally.copied++; }
      continue;
    }
    const reason = all ? skipReason(item, all) : null;
    if (reason) {
      if (await storeSkip(projectId, type, { code: item.code, publishedAt }, reason, key)) { await count(run, 1, 0); run.tally.skipped++; }
      continue;
    }
    const imageText = images.get(item.code);
    const parts = [
      { name: "judul", value: item.title }, { name: "isi", value: item.content },
      { name: "teks gambar", value: imageText ? `[Teks di gambar] ${imageText}` : "" },
    ].filter((p) => p.value?.trim());
    const text = parts.map((p) => p.value).join("\n").trim();
    if (text) posts.push({
      code: item.code, text: text.slice(0, MAX_ITEM_CHARS), publishedAt, key,
      // `parts` lists what the post had; a cut text may end before the last of them.
      input: { parts: parts.map((p) => p.name), characters: Math.min(text.length, MAX_ITEM_CHARS), truncated: text.length > MAX_ITEM_CHARS },
    });
    else {
      await storeMiss(projectId, type, { code: item.code, publishedAt }, "waiting_text", "Belum ada teks");
      run.tally.waiting++;
    }
  }
  await send(run, type, posts);
}

/** Posts to ask for next: never more than a batch, nor than the budget left. */
const pageSize = (run: Run) => Math.min(BATCH_SIZE, run.budget);

async function labelType(run: Run, type: MediaType, state: TypeState, startFrom: Date | null, save: () => Promise<unknown>) {
  const from = startFrom?.toISOString() ?? null;
  // An earlier start date walks the history again from the top; posts already recorded cost nothing.
  if (state.walkedFrom !== undefined && reachesFurther(state.walkedFrom, from)) { state.backfillDone = false; state.oldest = undefined; }
  state.walkedFrom = from;
  const inRange = (i: MediaItem) => !startFrom || new Date(i.publishedAt) >= startFrom;

  // 1. Posts newer than anything seen so far.
  while (run.budget > 0 && state.newest) {
    const page = await listItemsFromCursor(type, run.scope, "newer", state.newest, pageSize(run));
    if (!page.items.length) break;
    await processItems(run, type, page.items.filter(inRange));
    state.newest = page.next!;
    await save();
  }

  // 2. Failed posts (and posts waiting for text) that are due again.
  if (run.budget > 0) {
    const retry = await prisma.labelAiItem.findMany({
      where: {
        projectId: run.row.projectId, type, retryAfter: { lte: new Date() },
        OR: [{ status: "failed", attempts: { lt: MAX_ATTEMPTS } }, { status: "waiting_text", attempts: { lt: MAX_TEXT_CHECKS } }],
      },
      orderBy: { retryAfter: "asc" }, take: pageSize(run), select: { code: true },
    });
    if (retry.length) {
      const codes = retry.map((r) => r.code);
      const items = await fetchItemsByCode(type, codes);
      await processItems(run, type, items);
      const found = new Set(items.map((i) => i.code));
      // Gone from the source: stop asking for it.
      await prisma.labelAiItem.updateMany({
        where: { projectId: run.row.projectId, type, code: { in: codes.filter((c) => !found.has(c)) } },
        data: { status: "failed", attempts: MAX_ATTEMPTS, retryAfter: null, error: "Post tidak ditemukan lagi di sumber" },
      });
    }
  }

  // 3. Older history, back to the start date (or the end of the scope).
  while (run.budget > 0 && !state.backfillDone) {
    const page = await listItemsFromCursor(type, run.scope, "older", state.oldest ?? null, pageSize(run));
    if (!page.items.length) { state.backfillDone = true; break; }
    const wanted = page.items.filter(inRange);
    await processItems(run, type, wanted);
    state.newest ??= page.first!;
    state.oldest = page.next!;
    if (wanted.length < page.items.length) state.backfillDone = true;
    await save();
  }

  // 4. Posts that reached the source late, behind the forward cursor.
  if (run.budget > 0 && state.newest && Date.now() - (state.sweptAt ?? 0) >= SWEEP_EVERY_MS) {
    const floor = Math.max(startFrom?.getTime() ?? 0, Date.now() - SWEEP_WINDOW_MS);
    let cursor: TimeCursor | null = state.newest, scanned = 0;
    while (run.budget > 0 && cursor && scanned < SWEEP_SCAN_LIMIT) {
      const page = await listItemsFromCursor(type, run.scope, "older", cursor, 200);
      if (!page.items.length) break;
      scanned += page.items.length;
      cursor = page.next ?? null;
      const inWindow = page.items.filter((i) => new Date(i.publishedAt).getTime() >= floor);
      const known = new Set((await prisma.labelAiItem.findMany({
        where: { projectId: run.row.projectId, type, code: { in: inWindow.map((i) => i.code) } }, select: { code: true },
      })).map((r) => r.code));
      const unseen = inWindow.filter((i) => !known.has(i.code));
      for (let i = 0; i < unseen.length && run.budget > 0; i += BATCH_SIZE) await processItems(run, type, unseen.slice(i, i + Math.min(BATCH_SIZE, run.budget)));
      if (inWindow.length < page.items.length) break;
    }
    state.sweptAt = Date.now();
    await save();
  }
}

export async function runLabelProject(projectId: string) {
  const row = await prisma.labelAi.findUnique({ where: { projectId }, include: { project: true } });
  if (!row?.enabled || row.project.revokedAt) return;
  // The heartbeat the settings page shows, also while waiting or idle.
  const beat = (data: Prisma.LabelAiUpdateManyMutationInput = {}) => prisma.labelAi.updateMany({ where: { projectId }, data: { lastRunAt: new Date(), ...data } });
  const name = row.project.name;
  // Paused (not switched off) while the project has clients and none is active; resumes by itself.
  const paused = await aiPauseReason(projectId);
  if (paused) {
    logIdle(projectId, name, "dijeda: tidak ada instansi aktif");
    return void (await beat({ lastError: paused }));
  }
  if (row.retryAfter && row.retryAfter.getTime() > Date.now()) {
    logIdle(projectId, name, `menunggu sampai ${row.retryAfter.toLocaleTimeString("sv-SE", { timeZone: "Asia/Jakarta" })} WIB setelah error`);
    return void (await beat());
  }
  if (!labelAiProvider(row.provider).webSearch) {
    const message = "Dijeda otomatis: pencarian sumber belum tersedia untuk penyedia ini. Pilih DeepSeek.";
    log(`${name}: ${message}`);
    return void (await beat({ enabled: false, lastError: message }));
  }
  const options = row.project.manualLabels;
  if (!options.length) {
    logIdle(projectId, name, "belum ada pilihan label, dilewati");
    return void (await beat({ lastError: "Belum ada pilihan label di proyek ini." }));
  }
  const today = todayInJakarta();
  const todayCount = row.todayDate === today ? row.todayCount : 0;

  const instructions = syncLabelList(row.prompt ?? defaultLabelPrompt(options), options);
  const run: Run = {
    row, name, options, today, todayCount, failedCalls: 0, succeeded: false,
    tally: { sent: 0, labelled: 0, empty: 0, failed: 0, waiting: 0, human: 0, calls: 0, input: 0, output: 0, skipped: 0, copied: 0 },
    scope: await withImageCodes(projectId, parseKeyScope(row.project.scope, row.project.keywords)),
    system: `${instructions}\n\n${labelOutputFormat(options)}`,
    checkSystem: searchSystem(instructions),
    budget: TICK_BUDGET, // no daily cap: the start date (range) bounds the work
  };
  const cursors = (row.cursors ?? {}) as Cursors;
  const saveCursors = () => prisma.labelAi.updateMany({ where: { projectId }, data: { cursors: cursors as Prisma.InputJsonValue, lastRunAt: new Date() } });
  // Settings saved during the run (pause, new key, new provider) win: don't write this run's verdict over them.
  const verdict = (data: Prisma.LabelAiUpdateManyMutationInput) => prisma.labelAi.updateMany({ where: { projectId, savedAt: row.savedAt }, data });
  /** What this run did; silent about a run that found nothing, after saying so once. */
  const summary = () => {
    const t = run.tally;
    if (!t.sent && !t.calls && !t.waiting && !t.failed && !t.skipped && !t.copied) return false;
    quiet.delete(projectId);
    log(`${name}: ringkasan → ${num(t.sent)} post diproses: ${num(t.labelled)} berlabel, ${num(t.empty)} tanpa label, ${num(t.failed)} gagal, ${num(t.waiting)} menunggu teks${t.skipped ? `, ${num(t.skipped)} dilewati aturan` : ""}${t.copied ? `, ${num(t.copied)} salinan` : ""}${t.human ? `, ${num(t.human)} dilewati` : ""} · ${t.calls} panggilan, token masuk ${num(t.input)} / keluar ${num(t.output)} · hari ini ${num(run.todayCount)}`);
    return true;
  };
  try {
    const types = MEDIA_TYPES.filter((t) => allowsType(run.scope, t));
    const total = run.budget;
    // Each media type first gets an equal part; what one leaves unused goes to the others.
    for (const round of [0, 1]) for (const type of types) {
      if (run.budget <= 0) break;
      const held = round === 0 ? Math.max(0, run.budget - Math.ceil(total / types.length)) : 0;
      run.budget -= held;
      try {
        await labelType(run, type, (cursors[type] ??= {}), row.startFrom, saveCursors);
      } finally {
        run.budget += held;
      }
      const current = await prisma.labelAi.findUnique({ where: { projectId }, select: { enabled: true, savedAt: true } });
      if (!current?.enabled || current.savedAt.getTime() !== row.savedAt.getTime()) break;
    }
    await saveCursors();
    await verdict({ lastError: null, errorStreak: 0, retryAfter: null, lastRunAt: new Date() });
    if (!summary()) {
      const history = types.every((t) => cursors[t]?.backfillDone) ? "data lama sudah selesai" : "data lama masih ditelusuri";
      logIdle(projectId, name, `tidak ada post yang perlu dilabeli (${history}); menunggu post baru`);
    }
  } catch (error) {
    // A cursor only moves once its page is recorded, so what is left is picked up again.
    await saveCursors();
    const message = providerErrorMessage(error);
    summary();
    quiet.delete(projectId);
    if (error instanceof Changed) return void log(`${name}: pengaturan berubah, putaran dihentikan`);
    if (error instanceof Halt && error.kind === "pause") {
      log(`${name}: DIJEDA OTOMATIS: ${message}. Perbaiki, lalu aktifkan dan simpan lagi di halaman pengaturan label.`);
      await verdict({ enabled: false, lastError: `Dijeda otomatis: ${message}` });
    } else {
      const errorStreak = run.succeeded ? 1 : row.errorStreak + 1;
      log(`${name}: error, dicoba lagi dalam ${backoffMs(errorStreak) / 60_000} menit: ${message}`);
      await verdict({ lastError: message, errorStreak, retryAfter: new Date(Date.now() + backoffMs(errorStreak)) });
    }
  }
}

let turn = 0;

/** One pass over every enabled project: provider accounts side by side, the projects of one account in turn. */
export async function runLabelAi() {
  const rows = await prisma.labelAi.findMany({
    where: { enabled: true, project: { revokedAt: null } }, select: { projectId: true, provider: true, keyEnc: true }, orderBy: { createdAt: "asc" },
  });
  if (!rows.length) logIdle("", "worker", "belum ada proyek dengan pelabelan AI aktif; menunggu");
  else quiet.delete("");
  const groups = turnGroups(rows.map((r) => ({ projectId: r.projectId, providerKind: r.provider, providerBaseUrl: null, providerKeyEnc: r.keyEnc })), providerAccount, turn++);
  await runPool(groups, PARALLEL_ACCOUNTS, async (group) => {
    for (const { projectId } of group) await runLabelProject(projectId).catch((error) => console.error(`${clock()} [label-ai] ${projectId}: proses gagal:`, error));
  });
  return rows.length;
}
