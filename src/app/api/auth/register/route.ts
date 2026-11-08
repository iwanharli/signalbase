import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { signedIn } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";

const schema = z.object({
  name: z.string().trim().min(2, "Nama minimal 2 karakter").max(80),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_.]{3,30}$/, "Username 3–30 karakter: huruf kecil, angka, titik, atau garis bawah"),
  password: z.string().min(8, "Kata sandi minimal 8 karakter").max(200),
});

// Simple in-memory limit: 5 sign-ups per IP per hour.
const recent = new Map<string, number[]>();
const WINDOW = 60 * 60_000;

// Self-service sign-up. New accounts are always role "user": they see nothing until they create an API key with keywords.
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const hits = (recent.get(ip) ?? []).filter((t) => Date.now() - t < WINDOW);
  if (hits.length >= 5) return NextResponse.json({ error: "Terlalu banyak pendaftaran. Coba lagi nanti." }, { status: 429 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Data tidak valid" }, { status: 400 });
  const { name, username, password } = parsed.data;
  if (await prisma.admin.findUnique({ where: { username }, select: { id: true } })) {
    return NextResponse.json({ error: "Username sudah dipakai" }, { status: 409 });
  }
  recent.set(ip, [...hits, Date.now()]);
  const account = await prisma.admin.create({ data: { name, username, role: "user", passwordHash: await bcrypt.hash(password, 10) } });
  return signedIn(account);
}
