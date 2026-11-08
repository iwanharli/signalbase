import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { parseKeyScope, type KeyScope } from "@/lib/media/keyScope";
import { prisma } from "./db";
import { decryptSecret, encryptSecret } from "./secrets";

const hash = (key: string) => createHash("sha256").update(key).digest("hex");

// A key is checked by its SHA-256 hash. The full value is also stored encrypted so an admin can copy it again.
function newKey() {
  const key = `sb_${randomBytes(24).toString("base64url")}`;
  return { key, fields: { prefix: key.slice(0, 10), hash: hash(key), keyEnc: encryptSecret(key) } };
}

export async function createKey(name: string, scope: KeyScope, createdBy: string, ownerId: string | null = null) {
  const { key, fields } = newKey();
  const { keywords, ...rest } = scope;
  const row = await prisma.apiKey.create({ data: { name, createdBy, ownerId, ...fields, keywords, scope: rest } });
  return { ...row, key };
}

/** Replaces a key's value (the old value stops working at once); name, scope and AI labels are kept. */
export async function rotateKey(id: string) {
  const { key, fields } = newKey();
  const row = await prisma.apiKey.update({ where: { id }, data: { ...fields, lastUsedAt: null } });
  return { ...row, key };
}

/** The full key for copying, or null for keys created before encrypted storage. */
export function revealKey(keyEnc: string | null) {
  return keyEnc ? decryptSecret(keyEnc) : null;
}

// Wraps public API handlers: requires `Authorization: Bearer <key>` or `x-api-key`.
/** The authenticated key, as passed to public API handlers. */
export type ApiCaller = { keyId: string; scope: KeyScope };

export function apiRoute<C>(handler: (req: Request, ctx: C, caller: ApiCaller) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    const raw = req.headers.get("x-api-key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const row = raw ? await prisma.apiKey.findUnique({ where: { hash: hash(raw) } }) : null;
    if (!row || row.revokedAt) return NextResponse.json({ error: "Kunci API tidak valid" }, { status: 401 });
    // Keys of a user account that is not active (suspended, or somehow still pending) stop working until it is re-activated.
    if (row.ownerId) {
      const owner = await prisma.admin.findUnique({ where: { id: row.ownerId }, select: { status: true } });
      if (owner?.status !== "active") return NextResponse.json({ error: "Akun pemilik kunci tidak aktif" }, { status: 403 });
    }
    // Touch at most once a minute.
    if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000)
      prisma.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    return handler(req, ctx, { keyId: row.id, scope: parseKeyScope(row.scope, row.keywords) });
  };
}
