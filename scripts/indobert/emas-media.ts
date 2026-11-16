// Data uji emas media: post acak yang dikategorikan SETELAH data latih diekspor (tidak ada di label.jsonl), untuk
// dilabel manual. Tanpa AI. Satu baris {type, code, text, categoryAi}.
//   npx tsx --env-file=.env scripts/indobert/emas-media.ts <apiKeyId> <sejak ISO> <jumlah social> <jumlah online> keluar.jsonl
import { writeFileSync } from "node:fs";
import { prisma } from "../../src/lib/server/db";
import { fetchItemsByCode } from "../../src/lib/server/bank/items";

async function main() {
  const [apiKeyId, since, nSocial, nOnline, output] = process.argv.slice(2);
  if (!output) throw new Error("Pakai: emas-media.ts <apiKeyId> <sejak ISO> <n social> <n online> keluar.jsonl");
  const lines: string[] = [];
  for (const [type, n] of [["social", Number(nSocial)], ["online", Number(nOnline)]] as const) {
    const rows = await prisma.$queryRaw<{ code: string; category: string }[]>`
      select code, category from "Classification"
      where "apiKeyId" = ${apiKeyId} and type = ${type} and "createdAt" >= ${new Date(since)} and not manual
      order by random() limit ${n * 2}`;
    const items = await fetchItemsByCode(type, rows.map((r) => r.code));
    const ai = new Map(rows.map((r) => [r.code, r.category]));
    for (const it of items.slice(0, n)) {
      const text = [it.title, it.content].filter(Boolean).join("\n").trim();
      if (text) lines.push(JSON.stringify({ type, code: it.code, text, categoryAi: ai.get(it.code) ?? null }));
    }
  }
  writeFileSync(output, lines.join("\n") + "\n");
  console.log(`${lines.length} post emas ditulis`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
