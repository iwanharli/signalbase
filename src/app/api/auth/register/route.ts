import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/server/db";
import { accountFields, signupFields } from "@/lib/accounts";

const schema = z.object({ ...accountFields, ...signupFields });

// Simple in-memory limit: 5 sign-ups per IP per hour.
const recent = new Map<string, number[]>();
const WINDOW = 60 * 60_000;

// Sign-up for the Instansi subscription. New accounts are clients ("user") and "pending": they can sign in only after an
// admin approves them (setting the last day of access), and see data once an admin gives them a project. The institution
// and what it wants monitored tell the admin which project to set up.
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const hits = (recent.get(ip) ?? []).filter((t) => Date.now() - t < WINDOW);
  if (hits.length >= 5) return NextResponse.json({ error: "Terlalu banyak pendaftaran. Coba lagi nanti." }, { status: 429 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Data tidak valid" }, { status: 400 });
  const { name, username, password, institution, topics } = parsed.data;
  if (await prisma.admin.findUnique({ where: { username }, select: { id: true } })) {
    return NextResponse.json({ error: "Username sudah dipakai" }, { status: 409 });
  }
  recent.set(ip, [...hits, Date.now()]);
  await prisma.admin.create({ data: { name, username, role: "user", status: "pending", plan: "instansi", institution, requestedTopics: topics, passwordHash: await bcrypt.hash(password, 10) } });
  // No session yet: an admin has to approve the account first (Pengguna page).
  return NextResponse.json({ ok: true, pending: true });
}
