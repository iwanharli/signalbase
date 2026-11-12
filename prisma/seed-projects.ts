import { PrismaClient } from "@prisma/client";
import { keyScopeSchema } from "../src/lib/media/keyScope";
import { createKey } from "../src/lib/server/apiKey";

// Creates the sample projects below (no AI categorisation). Safe to run repeatedly: an active project with the same name is skipped.
// The key value is not printed; copy it from the panel (Proyek → Salin kunci).
const PROJECTS = [{ name: "Polisi", keywords: ["polisi"] }];

const prisma = new PrismaClient();
async function main() {
  for (const { name, keywords } of PROJECTS) {
    if (await prisma.apiKey.findFirst({ where: { name, revokedAt: null } })) { console.log(`Dilewati (sudah ada): ${name}`); continue; }
    const { prefix } = await createKey(name, keyScopeSchema.parse({ keywords }), "seed");
    console.log(`Proyek dibuat: ${name} (${prefix}••••)`);
  }
}
main().finally(() => prisma.$disconnect());
