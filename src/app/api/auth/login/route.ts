import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/server/db";
import { COOKIE, signSession } from "@/lib/session";

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
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, await signSession({ sub: admin.id, name: admin.name, username: admin.username }), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 12,
  });
  return res;
}
