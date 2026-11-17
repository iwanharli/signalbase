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
const ADMIN_ONLY = ["/api/admin/users", "/api/admin/contact", "/api/admin/ai-settings"];
/** Viewers read like admins but never change anything, see settings, or reveal secrets. */
const VIEWER_BLOCKED = [...ADMIN_ONLY, "/api/admin/ai-test"];
const isSecretPath = (path: string) => /^\/api\/admin\/keys\/[^/]+\/secret/.test(path);

/** A user account still allowed in: active itself, and for a sub-account also its parent. Checked on every request, so
 *  suspending someone (or the client's main account) cuts off an open session at once. */
export async function isActiveAccount(id: string) {
  const account = await prisma.admin.findUnique({ where: { id }, select: { status: true, parent: { select: { status: true } } } });
  return account?.status === "active" && (!account.parent || account.parent.status === "active");
}

/** Projects a user account sees: the ones it owns, and (sub-accounts) the ones shared with it. */
export const visibleKeys = (accountId: string) => ({ OR: [{ ownerId: accountId }, { members: { some: { accountId } } }] });

/** What the account may do with this project: "full" (admins, the owner), "read" (viewers, a sub-account it is shared
 *  with), or null when it may not see it at all. */
export async function keyAccess(user: PanelUser, keyId: string): Promise<"full" | "read" | null> {
  if (user.role === "admin") return "full";
  if (user.role === "viewer") return "read";
  const key = await prisma.apiKey.findUnique({ where: { id: keyId }, select: { ownerId: true, members: { where: { accountId: user.id }, select: { accountId: true } } } });
  if (!key) return null;
  return key.ownerId === user.id ? "full" : key.members.length ? "read" : null;
}

/** True when the account may see this project (and browse the bank through it). */
export async function canSeeKey(user: PanelUser, keyId: string) {
  return (await keyAccess(user, keyId)) !== null;
}

// Wraps panel route handlers; middleware already guards sign-in, this is defence in depth.
// For "user" accounts it also checks the account is still active, blocks admin-only APIs, and blocks any
// /api/admin/keys/<id>/… on a key they don't own (a project shared with a sub-account: reading and labelling posts only,
// never its secret),
// so every per-key route is covered in one place.
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
      if (!(await isActiveAccount(user.id))) return NextResponse.json({ error: "Akun tidak aktif" }, { status: 401 });
      const path = new URL(req.url).pathname;
      if (ADMIN_ONLY.some((p) => path.startsWith(p))) return NextResponse.json({ error: "Khusus admin" }, { status: 403 });
      const keyId = path.match(/^\/api\/admin\/keys\/([^/]+)/)?.[1];
      if (keyId) {
        const access = await keyAccess(user, decodeURIComponent(keyId));
        if (!access) return NextResponse.json({ error: "Proyek tidak ditemukan" }, { status: 404 });
        // Sub-accounts read a shared project; the one thing they may write is labels on its posts.
        const labelling = /^\/api\/admin\/keys\/[^/]+\/item-labels$/.test(path);
        if (access === "read" && !labelling && ((req.method !== "GET" && req.method !== "HEAD") || isSecretPath(path))) {
          return NextResponse.json({ error: "Proyek ini dibagikan untuk dilihat saja" }, { status: 403 });
        }
      }
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
