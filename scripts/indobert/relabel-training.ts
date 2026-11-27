// Relabels the IndoBERT QW training data (label.jsonl for train_qw.py) with the classifier's current prompt + categories,
// through the same provider and functions as the production worker (buildJob, classifyBatch), without reasons (not used for
// training; half the cost). The cost is recorded as the project's TokenUsage.
//   npx tsx --env-file=.env scripts/indobert/relabel-training.ts <apiKeyId> label.jsonl label-new.jsonl
// Resumable: posts already in the output file are skipped. previousCategory keeps the earlier label.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { prisma } from "../../src/lib/server/db";
import { classifyBatch } from "../../src/lib/server/ai/providers";
import { buildJob, loadClassifier, recordTokens } from "../../src/lib/server/ai/worker";

type Row = { type: "social" | "online"; code: string; category: string; confidence: number | null; text: string; publishedAt?: string; previousCategory?: string };
const BATCH = 20; // same as the worker
const PARALLEL = 8;

async function main() {
  const [apiKeyId, input, output] = process.argv.slice(2);
  if (!apiKeyId || !input || !output) throw new Error("Usage: relabel-training.ts <apiKeyId> in.jsonl out.jsonl");
  const row = await loadClassifier(apiKeyId);
  if (!row) throw new Error("Classifier not found");
  const job = buildJob(row);
  const done = new Set(existsSync(output) ? readFileSync(output, "utf8").split("\n").filter(Boolean).map((l) => (JSON.parse(l) as Row).code) : []);
  const rows: Row[] = readFileSync(input, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Row).filter((r) => !done.has(r.code));
  const batches = (["social", "online"] as const).flatMap((t) => {
    const of = rows.filter((r) => r.type === t);
    return Array.from({ length: Math.ceil(of.length / BATCH) }, (_, i) => of.slice(i * BATCH, (i + 1) * BATCH));
  });
  console.log(`${rows.length} posts to relabel (${done.size} already done), ${batches.length} batches, model ${job.provider.model}`);
  let next = 0, ok = 0, changed = 0, failed = 0;
  const onUsage = recordTokens(apiKeyId, job.provider.model, job.providerHint);
  await Promise.all(Array.from({ length: PARALLEL }, async () => {
    while (next < batches.length) {
      const part = batches[next++];
      const type = part[0].type;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await classifyBatch(job.provider, job.prompt, job.categories[type], part.map((r) => ({ id: r.code, text: r.text })), onUsage, { reason: false });
          const byId = new Map(res.map((r) => [r.id, r]));
          const lines = part.flatMap((r) => {
            const x = byId.get(r.code);
            if (!x) return [];
            if (x.category !== r.category) changed++;
            ok++;
            return [JSON.stringify({ ...r, category: x.category, confidence: x.confidence, previousCategory: r.category })];
          });
          if (lines.length) appendFileSync(output, lines.join("\n") + "\n");
          break;
        } catch (e) {
          if (attempt === 1) { failed++; console.warn("batch failed:", e instanceof Error ? e.message.slice(0, 200) : e); }
        }
      }
      if (next % 100 === 0) console.log(`${next}/${batches.length} batches, ${ok} labelled, ${changed} changed, ${failed} failed`);
    }
  }));
  console.log(`done: ${ok} labelled, ${changed} categories changed, ${failed} batches failed`);
  await new Promise((r) => setTimeout(r, 1500)); // token recording runs in the background
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
