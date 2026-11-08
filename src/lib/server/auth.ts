import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE, roleOf, signSession, verifySession, type Role } from "../session";
import { prisma } from "./db";

export async function getSession() {
  return verifySession((await cookies()).get(COOKIE)?.value);
}

/** The signed-in panel account as route handlers see it. */
export type PanelUser = { id: string; username: string; role: Role };

/** Panel APIs only admins may call. */
const ADMIN_ONLY = ["/api/admin/users", "/api/admin/contact"];

/** A user account still allowed in. Checked on every request, so suspending someone cuts off an open session at once. */
export async function isActiveAccount(id: string) {
  const account = await prisma.admin.findUnique({ where: { id }, select: { status: true } });
  return account?.status === "active";
}


/** True when the account may act on this API key: admins on every key, users only on their own. */
export async function ownsKey(user: PanelUser, keyId: string) {
  if (user.role === "admin") return true;
  const key = await prisma.apiKey.findUnique({ where: { id: keyId }, select: { ownerId: true } });
  return key?.ownerId === user.id;
}

// Wraps panel route handlers; middleware already guards sign-in, this is defence in depth.
// For "user" accounts it also checks the account is still active, blocks admin-only APIs, and blocks any
// /api/admin/keys/<id>/… on a key they don't own,
// so every per-key route is covered in one place.
export function adminRoute<C>(handler: (req: Request, ctx: C, username: string, user: PanelUser) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user: PanelUser = { id: session.sub, username: session.username, role: roleOf(session) };
    if (user.role === "user") {
      if (!(await isActiveAccount(user.id))) return NextResponse.json({ error: "Akun tidak aktif" }, { status: 401 });
      const path = new URL(req.url).pathname;
      if (ADMIN_ONLY.some((p) => path.startsWith(p))) return NextResponse.json({ error: "Khusus admin" }, { status: 403 });
      const keyId = path.match(/^\/api\/admin\/keys\/([^/]+)/)?.[1];
      if (keyId && !(await ownsKey(user, decodeURIComponent(keyId)))) return NextResponse.json({ error: "Kunci tidak ditemukan" }, { status: 404 });
    }
    return handler(req, ctx, session.username, user);
  };
}

/** Signs the account in: sets the session cookie on the response and tells the client where to go. */
export async function signedIn(account: { id: string; name: string; username: string; role: string }) {
  const session = { sub: account.id, name: account.name, username: account.username, role: account.role === "user" ? "user" as const : "admin" as const };
  const res = NextResponse.json({ ok: true, home: "/dashboard" });
  res.cookies.set(COOKIE, await signSession(session), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 12,
  });
  return res;
}
