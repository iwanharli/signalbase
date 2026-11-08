import { createHash, randomBytes } from "crypto";
import { isExpired, jakartaToday, limitsFor, type PlanLimits } from "../plans";
import { EXPIRED_MESSAGE } from "./plan";
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
export type ApiCaller = {
  keyId: string;
  scope: KeyScope;
  /** Owner's plan history window in days; null = unlimited. */
  historyDays: number | null;
  /** Bank analysis the owner's plan includes. */
  analysis: PlanLimits["analysis"];
};

export function apiRoute<C>(handler: (req: Request, ctx: C, caller: ApiCaller) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    const raw = req.headers.get("x-api-key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const row = raw ? await prisma.apiKey.findUnique({ where: { hash: hash(raw) } }) : null;
    if (!row || row.revokedAt) return NextResponse.json({ error: "Kunci API tidak valid" }, { status: 401 });
    // Keys of a user account that is not active (suspended, or somehow still pending) stop working until it is re-activated.
    // Keys of an account whose trial or paid period ended stop working too, until a plan is chosen.
    let limits = limitsFor(null);
    if (row.ownerId) {
      const owner = await prisma.admin.findUnique({ where: { id: row.ownerId }, select: { status: true, plan: true, planExpiresAt: true } });
      if (owner?.status !== "active") return NextResponse.json({ error: "Akun pemilik kunci tidak aktif" }, { status: 403 });
      if (isExpired(owner.planExpiresAt)) return NextResponse.json({ error: EXPIRED_MESSAGE, expired: true }, { status: 403 });
      limits = limitsFor(owner.plan);
    }

    // Daily call limit, shared by all keys of the owner's account. Every call is counted per key for the panel.
    const day = jakartaToday();
    let remaining: number | null = null;
    if (row.ownerId && limits.callsPerDay !== null) {
      const used = (await prisma.apiKeyUsage.aggregate({ _sum: { count: true }, where: { day, apiKey: { ownerId: row.ownerId } } }))._sum.count ?? 0;
      if (used >= limits.callsPerDay) {
        return NextResponse.json(
          { error: `Batas ${limits.callsPerDay.toLocaleString("id-ID")} panggilan API per hari untuk akun ini sudah tercapai. Kuota diisi ulang pukul 00.00 WIB.`, limitReached: true },
          { status: 429, headers: { "X-RateLimit-Limit": String(limits.callsPerDay), "X-RateLimit-Remaining": "0" } },
        );
      }
      remaining = limits.callsPerDay - used - 1;
    }
    await prisma.apiKeyUsage.upsert({ where: { apiKeyId_day: { apiKeyId: row.id, day } }, create: { apiKeyId: row.id, day, count: 1 }, update: { count: { increment: 1 } } });
    // Touch at most once a minute.
    if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000)
      prisma.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    const res = await handler(req, ctx, { keyId: row.id, scope: parseKeyScope(row.scope, row.keywords), historyDays: limits.historyDays, analysis: limits.analysis });
    if (remaining !== null) {
      res.headers.set("X-RateLimit-Limit", String(limits.callsPerDay));
      res.headers.set("X-RateLimit-Remaining", String(Math.max(0, remaining)));
    }
    return res;
  };
}
