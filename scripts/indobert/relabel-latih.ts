// Label ulang data latih IndoBERT QW (label.jsonl dari latih_qw.py) dengan prompt + kategori classifier saat ini, lewat
// penyedia dan fungsi yang sama dengan worker produksi (buildJob, classifyBatch), tanpa alasan (tidak dipakai untuk melatih;
// separuh biaya). Biaya tercatat sebagai TokenUsage proyek.
//   npx tsx --env-file=.env scripts/indobert/relabel-latih.ts <apiKeyId> label.jsonl label-baru.jsonl
// Bisa dilanjutkan: post yang sudah ada di berkas keluaran dilewati. Kolom kategoriLama menyimpan label sebelumnya.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { prisma } from "../../src/lib/server/db";
import { classifyBatch } from "../../src/lib/server/ai/providers";
import { buildJob, loadClassifier, recordTokens } from "../../src/lib/server/ai/worker";

type Row = { type: "social" | "online"; code: string; category: string; confidence: number | null; text: string; publishedAt?: string; kategoriLama?: string };
const BATCH = 20; // sama dengan worker
const PARALLEL = 8;

async function main() {
  const [apiKeyId, input, output] = process.argv.slice(2);
  if (!apiKeyId || !input || !output) throw new Error("Pakai: relabel-latih.ts <apiKeyId> masuk.jsonl keluar.jsonl");
  const row = await loadClassifier(apiKeyId);
  if (!row) throw new Error("Classifier tidak ditemukan");
  const job = buildJob(row);
  const done = new Set(existsSync(output) ? readFileSync(output, "utf8").split("\n").filter(Boolean).map((l) => (JSON.parse(l) as Row).code) : []);
  const rows: Row[] = readFileSync(input, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Row).filter((r) => !done.has(r.code));
  const batches = (["social", "online"] as const).flatMap((t) => {
    const of = rows.filter((r) => r.type === t);
    return Array.from({ length: Math.ceil(of.length / BATCH) }, (_, i) => of.slice(i * BATCH, (i + 1) * BATCH));
  });
  console.log(`${rows.length} post dilabel ulang (${done.size} sudah), ${batches.length} kelompok, model ${job.provider.model}`);
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
            return [JSON.stringify({ ...r, category: x.category, confidence: x.confidence, kategoriLama: r.category })];
          });
          if (lines.length) appendFileSync(output, lines.join("\n") + "\n");
          break;
        } catch (e) {
          if (attempt === 1) { failed++; console.warn("kelompok gagal:", e instanceof Error ? e.message.slice(0, 200) : e); }
        }
      }
      if (next % 100 === 0) console.log(`${next}/${batches.length} kelompok, ${ok} berlabel, ${changed} berubah, ${failed} gagal`);
    }
  }));
  console.log(`selesai: ${ok} berlabel, ${changed} kategori berubah, ${failed} kelompok gagal`);
  await new Promise((r) => setTimeout(r, 1500)); // pencatatan token berjalan di latar
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
