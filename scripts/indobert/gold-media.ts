// Media gold set: random posts categorised AFTER the training data was exported (not in label.jsonl), to be labelled by hand
// (add a "gold" field). No AI. One line {type, code, text, categoryAi}.
//   npx tsx --env-file=.env scripts/indobert/gold-media.ts <projectId> <since ISO> <n social> <n online> out.jsonl
import { writeFileSync } from "node:fs";
import { prisma } from "../../src/lib/server/db";
import { fetchItemsByCode } from "../../src/lib/server/bank/items";

async function main() {
  const [projectId, since, nSocial, nOnline, output] = process.argv.slice(2);
  if (!output) throw new Error("Usage: gold-media.ts <projectId> <since ISO> <n social> <n online> out.jsonl");
  const lines: string[] = [];
  for (const [type, n] of [["social", Number(nSocial)], ["online", Number(nOnline)]] as const) {
    const rows = await prisma.$queryRaw<{ code: string; category: string }[]>`
      select code, category from "Classification"
      where "projectId" = ${projectId} and type = ${type} and "createdAt" >= ${new Date(since)} and not manual
      order by random() limit ${n * 2}`;
    const items = await fetchItemsByCode(type, rows.map((r) => r.code));
    const ai = new Map(rows.map((r) => [r.code, r.category]));
    for (const it of items.slice(0, n)) {
      const text = [it.title, it.content].filter(Boolean).join("\n").trim();
      if (text) lines.push(JSON.stringify({ type, code: it.code, text, categoryAi: ai.get(it.code) ?? null }));
    }
  }
  writeFileSync(output, lines.join("\n") + "\n");
  console.log(`${lines.length} gold posts written`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
