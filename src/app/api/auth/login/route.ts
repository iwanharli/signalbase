import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/server/db";
import { signedIn } from "@/lib/server/auth";

// One sign-in for every role (admin and user).
// Simple in-memory lockout: 5 failures per username within 15 minutes.
const fails = new Map<string, number[]>();
const WINDOW = 15 * 60_000;

export async function POST(req: Request) {
  const { username, password } = await req.json().catch(() => ({}));
  const user = String(username ?? "").trim();
  const recent = (fails.get(user) ?? []).filter((t) => Date.now() - t < WINDOW);
  if (recent.length >= 5) return NextResponse.json({ error: "Terlalu banyak percobaan gagal. Coba lagi dalam 15 menit." }, { status: 429 });

  const admin = user ? await prisma.admin.findUnique({ where: { username: user } }) : null;
  if (!admin || !(await bcrypt.compare(String(password ?? ""), admin.passwordHash))) {
    fails.set(user, [...recent, Date.now()]);
    return NextResponse.json({ error: "Username atau kata sandi salah." }, { status: 401 });
  }
  fails.delete(user);
  if (admin.status === "pending") return NextResponse.json({ error: "Akun Anda menunggu persetujuan admin." }, { status: 403 });
  if (admin.status === "suspended") return NextResponse.json({ error: "Akun Anda dinonaktifkan. Hubungi admin." }, { status: 403 });
  return signedIn(admin);
}
