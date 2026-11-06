import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { parseKeyScope, type KeyScope } from "@/lib/media/keyScope";
import { prisma } from "./db";

const hash = (key: string) => createHash("sha256").update(key).digest("hex");

// Keys are shown once on creation; only their SHA-256 is stored.
export async function createKey(name: string, scope: KeyScope) {
  const key = `sb_${randomBytes(24).toString("base64url")}`;
  const { keywords, ...rest } = scope;
  const row = await prisma.apiKey.create({ data: { name, prefix: key.slice(0, 10), hash: hash(key), keywords, scope: rest } });
  return { ...row, key };
}

// Wraps public API handlers: requires `Authorization: Bearer <key>` or `x-api-key`.
export function apiRoute<C>(handler: (req: Request, ctx: C, scope: KeyScope) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    const raw = req.headers.get("x-api-key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const row = raw ? await prisma.apiKey.findUnique({ where: { hash: hash(raw) } }) : null;
    if (!row || row.revokedAt) return NextResponse.json({ error: "Kunci API tidak valid" }, { status: 401 });
    // Touch at most once a minute.
    if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000)
      prisma.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    return handler(req, ctx, parseKeyScope(row.scope, row.keywords));
  };
}
