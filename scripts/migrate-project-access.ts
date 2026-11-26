// One-off migration to the 2026-11-26 subscription model (run once per database after deploying it):
// - every project owned by a client becomes an admin project the client is given (ProjectMember with its own API key);
//   the project's own key keeps working as its internal key, so existing integrations do not break;
// - client plans become "instansi" (the only plan); sub-accounts are removed.
// Dry run by default: prints what it would do. Change data with --apply.
//   npx tsx --env-file=.env scripts/migrate-project-access.ts [--apply]
import { prisma } from "../src/lib/server/db";
import { grantAccess } from "../src/lib/server/projectAccess";

const apply = process.argv.includes("--apply");
const say = (line: string) => console.log(`${apply ? "" : "[uji] "}${line}`);

async function main() {
  const owned = (await prisma.apiKey.findMany({ where: { ownerId: { not: null } }, select: { id: true, name: true, ownerId: true } })) as { id: string; name: string; ownerId: string }[];
  for (const key of owned) {
    const owner = await prisma.admin.findUnique({ where: { id: key.ownerId }, select: { username: true, role: true } });
    say(`proyek "${key.name}": pemilik @${owner?.username ?? key.ownerId} → akses klien (kunci baru per klien), pemilik dikosongkan`);
    if (apply) {
      if (owner?.role === "user") await grantAccess(key.id, key.ownerId, "migrasi");
      await prisma.apiKey.update({ where: { id: key.id }, data: { ownerId: null } });
    }
  }

  const plans = await prisma.admin.findMany({ where: { role: "user", plan: { not: "instansi" } }, select: { username: true, plan: true } });
  for (const a of plans) say(`klien @${a.username}: paket ${a.plan ?? "kosong"} → instansi`);
  if (apply && plans.length) await prisma.admin.updateMany({ where: { role: "user", plan: { not: "instansi" } }, data: { plan: "instansi" } });
  const unplanned = await prisma.admin.count({ where: { role: "user", plan: null } });
  if (unplanned) {
    say(`${unplanned} klien tanpa paket → instansi`);
    if (apply) await prisma.admin.updateMany({ where: { role: "user", plan: null }, data: { plan: "instansi" } });
  }

  const subs = await prisma.admin.findMany({ where: { parentId: { not: null } }, select: { id: true, username: true } });
  for (const s of subs) say(`sub-akun @${s.username}: dihapus`);
  if (apply && subs.length) await prisma.admin.deleteMany({ where: { id: { in: subs.map((s) => s.id) } } });

  if (!owned.length && !plans.length && !unplanned && !subs.length) say("tidak ada yang perlu dimigrasi");
  if (!apply) console.log("\nUji coba saja. Jalankan dengan --apply untuk menerapkan.");
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
