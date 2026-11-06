// Edge-safe JWT helpers (used by middleware and route handlers).
import { SignJWT, jwtVerify } from "jose";

export const COOKIE = "sb_session";
const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET);

export type Session = { sub: string; name: string; username: string };

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
