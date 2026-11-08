import { createHash, randomBytes } from "crypto";
import { isExpired, jakartaToday, limitsFor, type PlanLimits } from "../plans";
import { EXPIRED_MESSAGE } from "./plan";
import { NextResponse } from "next/server";
import { parseKeyScope, type KeyScope } from "@/lib/media/keyScope";
import { ipAllowed, originAllowed, requestHost } from "../keyAccess";
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

/** Client IP as Cloudflare and nginx pass it on. */
function clientIp(req: Request) {
  const h = req.headers;
  return h.get("cf-connecting-ip") ?? h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

/** CORS headers: browsers on an allowed site may read the response; everyone else gets none (server calls don't need them). */
function corsHeaders(origin: string | null, allowed: boolean): Record<string, string> {
  if (!origin || !allowed) return {};
  return { "Access-Control-Allow-Origin": origin, "Access-Control-Expose-Headers": "X-RateLimit-Limit, X-RateLimit-Remaining", Vary: "Origin" };
}

/** Preflight for browser calls. It carries no key, so it is answered for any site; the real request is checked. */
export function apiPreflight(req: Request) {
  const origin = req.headers.get("origin");
  return new Response(null, {
    status: 204,
    headers: origin ? {
      "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, X-API-Key, Content-Type", "Access-Control-Max-Age": "86400", Vary: "Origin",
    } : {},
  });
}

export function apiRoute<C>(handler: (req: Request, ctx: C, caller: ApiCaller) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    const origin = req.headers.get("origin");
    let cors: Record<string, string> = {};
    const reply = (res: Response) => { for (const [name, value] of Object.entries(cors)) res.headers.set(name, value); return res; };

    const raw = req.headers.get("x-api-key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const row = raw ? await prisma.apiKey.findUnique({ where: { hash: hash(raw) } }) : null;
    if (!row || row.revokedAt) return NextResponse.json({ error: "Kunci API tidak valid" }, { status: 401 });

    // Access rules: with any rule set, the call must come from an allowed IP (servers) or an allowed site (browsers).
    const host = requestHost(origin, req.headers.get("referer"));
    const fromAllowedSite = row.allowedOrigins.length > 0 && originAllowed(host, row.allowedOrigins);
    if (row.allowedIps.length || row.allowedOrigins.length) {
      const ip = clientIp(req);
      if (!fromAllowedSite && !(row.allowedIps.length && ipAllowed(ip, row.allowedIps))) {
        const where = host ? `situs ${host}` : `alamat IP ${ip ?? "tidak diketahui"}`;
        return NextResponse.json({ error: `Kunci API ini tidak diizinkan dipakai dari ${where}. Atur akses di halaman Proyek.`, forbiddenSource: true }, { status: 403 });
      }
    }
    // Browsers may only read responses on sites the key allows; a key without site rules isn't meant for browsers.
    cors = corsHeaders(origin, fromAllowedSite);

    // Keys of a user account that is not active (suspended, or somehow still pending) stop working until it is re-activated.
    // Keys of an account whose trial or paid period ended stop working too, until a plan is chosen.
    let limits = limitsFor(null);
    if (row.ownerId) {
      const owner = await prisma.admin.findUnique({ where: { id: row.ownerId }, select: { status: true, plan: true, planExpiresAt: true } });
      if (owner?.status !== "active") return reply(NextResponse.json({ error: "Akun pemilik kunci tidak aktif" }, { status: 403 }));
      if (isExpired(owner.planExpiresAt)) return reply(NextResponse.json({ error: EXPIRED_MESSAGE, expired: true }, { status: 403 }));
      limits = limitsFor(owner.plan);
    }

    // Daily call limit, shared by all keys of the owner's account. Every call is counted per key for the panel.
    const day = jakartaToday();
    let remaining: number | null = null;
    if (row.ownerId && limits.callsPerDay !== null) {
      const used = (await prisma.apiKeyUsage.aggregate({ _sum: { count: true }, where: { day, apiKey: { ownerId: row.ownerId } } }))._sum.count ?? 0;
      if (used >= limits.callsPerDay) {
        return reply(NextResponse.json(
          { error: `Batas ${limits.callsPerDay.toLocaleString("id-ID")} panggilan API per hari untuk akun ini sudah tercapai. Kuota diisi ulang pukul 00.00 WIB.`, limitReached: true },
          { status: 429, headers: { "X-RateLimit-Limit": String(limits.callsPerDay), "X-RateLimit-Remaining": "0" } },
        ));
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
    return reply(res);
  };
}
