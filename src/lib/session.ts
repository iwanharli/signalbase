// Edge-safe JWT helpers (used by middleware and route handlers).
import { SignJWT, jwtVerify } from "jose";

export const COOKIE = "sb_session";
const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET);

/** admin: everything. user: own projects. viewer: sees what an admin sees, read-only, without settings. */
export type Role = "admin" | "user" | "viewer";
/** role is missing on sessions issued before roles existed; those were all admins. */
export type Session = { sub: string; name: string; username: string; role?: Role };
export const roleOf = (s: Session): Role => (s.role === "user" ? "user" : s.role === "viewer" ? "viewer" : "admin");
/** Admins and viewers see the whole bank and every project; users only their own. */
export const seesAll = (role: Role) => role !== "user";

/** Admin API paths that reveal a stored secret in full: closed to viewers and to accounts a project is only shared with.
 *  Every new route that returns one belongs here. */
export function isSecretPath(path: string) {
  // %XX is decoded first, so an encoded spelling cannot slip past.
  const plain = path.replace(/%([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  return /^\/api\/admin\/keys\/[^/]+\/(secret|classifier\/provider-key)/.test(plain);
}

export async function signSession(s: Session) {
  return new SignJWT(s).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("12h").sign(secret());
}

export async function verifySession(token?: string): Promise<Session | null> {
  if (!token) return null;
  try {
    return (await jwtVerify(token, secret())).payload as unknown as Session;
  } catch {
    return null;
  }
}
