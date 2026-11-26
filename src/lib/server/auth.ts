import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE, isSecretPath, roleOf, signSession, verifySession, type Role } from "../session";
import { isExpired } from "../plans";
import { prisma } from "./db";
import { EXPIRED_MESSAGE } from "./plan";

export async function getSession() {
  return verifySession((await cookies()).get(COOKIE)?.value);
}

/** The signed-in panel account as route handlers see it. */
export type PanelUser = { id: string; username: string; role: Role };

/** Panel APIs only admins may call (clients see neither money, plans, usage nor other accounts). */
const ADMIN_ONLY = ["/api/admin/users", "/api/admin/contact", "/api/admin/ai-settings", "/api/admin/billing"];
/** Viewers read like admins but never change anything, see settings, or reveal secrets. */
const VIEWER_BLOCKED = [...ADMIN_ONLY, "/api/admin/ai-test"];
/** The only writes a client may make, on a project given to them: label a post, correct its AI category. */
const CLIENT_CORRECTIONS = /^\/api\/admin\/keys\/[^/]+\/(item-labels|classifications)$/;
export const clientMayWrite = (method: string, path: string) => method === "PUT" && CLIENT_CORRECTIONS.test(path);

/** A client ("user") account still allowed in: approved and not suspended. Checked on every request, so suspending a
 *  client cuts off an open session at once. */
export async function isActiveAccount(id: string) {
  const account = await prisma.admin.findUnique({ where: { id }, select: { status: true } });
  return account?.status === "active";
}

/** Projects a client account sees: the ones an admin gave it. */
export const visibleKeys = (accountId: string) => ({ members: { some: { accountId } } });

/** What the account may do with this project: "full" (admins), "read" (viewers, and clients it was given to), or null
 *  when it may not see it at all. */
export async function keyAccess(user: PanelUser, keyId: string): Promise<"full" | "read" | null> {
  if (user.role === "admin") return "full";
  if (user.role === "viewer") return "read";
  const member = await prisma.projectMember.findUnique({ where: { apiKeyId_accountId: { apiKeyId: keyId, accountId: user.id } }, select: { accountId: true } });
  return member ? "read" : null;
}

/** True when the account may see this project (and browse the bank through it). */
export async function canSeeKey(user: PanelUser, keyId: string) {
  return (await keyAccess(user, keyId)) !== null;
}

// Wraps panel route handlers; middleware already guards sign-in, this is defence in depth.
// Client ("user") accounts mostly read: the account must be active and its subscription running, nothing may be changed
// except labels and AI category corrections of their projects (clientMayWrite), admin-only APIs are blocked, and /api/admin/keys/<id>/… only answers for a project
// given to the client and never its secrets. So every route is covered in one place.
export function adminRoute<C>(handler: (req: Request, ctx: C, username: string, user: PanelUser) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user: PanelUser = { id: session.sub, username: session.username, role: roleOf(session) };
    if (user.role === "viewer") {
      const path = new URL(req.url).pathname;
      if (req.method !== "GET" && req.method !== "HEAD") return NextResponse.json({ error: "Akun viewer hanya dapat melihat data" }, { status: 403 });
      if (VIEWER_BLOCKED.some((p) => path.startsWith(p)) || isSecretPath(path)) return NextResponse.json({ error: "Tidak tersedia untuk akun viewer" }, { status: 403 });
    }
    if (user.role === "user") {
      const account = await prisma.admin.findUnique({ where: { id: user.id }, select: { status: true, planExpiresAt: true } });
      if (account?.status !== "active") return NextResponse.json({ error: "Akun tidak aktif" }, { status: 401 });
      if (isExpired(account.planExpiresAt)) return NextResponse.json({ error: EXPIRED_MESSAGE, expired: true }, { status: 403 });
      const path = new URL(req.url).pathname;
      if (req.method !== "GET" && req.method !== "HEAD" && !clientMayWrite(req.method, path)) return NextResponse.json({ error: "Akun klien hanya dapat melihat data" }, { status: 403 });
      if (ADMIN_ONLY.some((p) => path.startsWith(p)) || isSecretPath(path)) return NextResponse.json({ error: "Khusus admin" }, { status: 403 });
      const keyId = path.match(/^\/api\/admin\/keys\/([^/]+)/)?.[1];
      if (keyId && !(await keyAccess(user, decodeURIComponent(keyId)))) return NextResponse.json({ error: "Proyek tidak ditemukan" }, { status: 404 });
    }
    return handler(req, ctx, session.username, user);
  };
}

/** Signs the account in: sets the session cookie on the response and tells the client where to go. */
export async function signedIn(account: { id: string; name: string; username: string; role: string }) {
  const session = { sub: account.id, name: account.name, username: account.username, role: (account.role === "user" ? "user" : account.role === "viewer" ? "viewer" : "admin") as Role };
  const res = NextResponse.json({ ok: true, home: "/dashboard" });
  res.cookies.set(COOKIE, await signSession(session), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 12,
  });
  return res;
}
