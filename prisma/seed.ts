import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// Creates the first admin from .env if none exists. Safe to run repeatedly.
const prisma = new PrismaClient();
async function main() {
  const username = process.env.ADMIN_USERNAME ?? "admin";
  if (await prisma.admin.count()) return;
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error("ADMIN_PASSWORD belum diatur");
  await prisma.admin.create({ data: { username, name: "Administrator", passwordHash: await bcrypt.hash(password, 10) } });
  console.log(`Admin dibuat: ${username}`);
}
main().finally(() => prisma.$disconnect());
