import { createHash, randomBytes } from "crypto";
import { isExpired, jakartaToday, limitsFor, type PlanLimits } from "../plans";
import { EXPIRED_MESSAGE } from "./plan";
import { NextResponse } from "next/server";
import { parseKeyScope, type KeyScope } from "@/lib/media/keyScope";
import { ipAllowed, originAllowed, requestHost } from "../keyAccess";
import { prisma } from "./db";
import { decryptSecret, encryptSecret } from "./secrets";
import { withImageCodes } from "./media/textSignals";
import { accessByKey } from "./projectAccess";

export const hash = (key: string) => createHash("sha256").update(key).digest("hex");

// A key is checked by its SHA-256 hash. The full value is also stored encrypted so an admin can copy it again.
export function newKey() {
  const key = `sb_${randomBytes(24).toString("base64url")}`;
  return { key, fields: { prefix: key.slice(0, 10), hash: hash(key), keyEnc: encryptSecret(key) } };
}

export async function createKey(name: string, scope: KeyScope, createdBy: string) {
  const { key, fields } = newKey();
  const { keywords, ...rest } = scope;
  const row = await prisma.project.create({ data: { name, createdBy, ...fields, keywords, scope: rest } });
  return { ...row, key };
}

/** Replaces a key's value (the old value stops working at once); name, scope and AI labels are kept. */
export async function rotateKey(id: string) {
  const { key, fields } = newKey();
  const row = await prisma.project.update({ where: { id }, data: { ...fields, lastUsedAt: null } });
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
  /** History window in days; null = unlimited (plans no longer limit it). */
  historyDays: number | null;
  /** Bank analysis included with each item. */
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

    // Two kinds of key: the project's internal key (admins, existing integrations) and a client's key for the project
    // (ProjectMember), which works only while that client is active and its subscription runs.
    const raw = req.headers.get("x-api-key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const internal = raw ? await prisma.project.findUnique({ where: { hash: hash(raw) } }) : null;
    const access = raw && !internal ? await accessByKey(raw) : null;
    const row = internal ?? access?.project ?? null;
    if (!row || row.revokedAt || (access && (access.keyRevokedAt || access.account.role !== "user"))) return NextResponse.json({ error: "Kunci API tidak valid" }, { status: 401 });

    // Access rules: with any rule set, the call must come from an allowed IP (servers) or an allowed site (browsers).
    const host = requestHost(origin, req.headers.get("referer"));
    const fromAllowedSite = row.allowedOrigins.length > 0 && originAllowed(host, row.allowedOrigins);
    if (row.allowedIps.length || row.allowedOrigins.length) {
      const ip = clientIp(req);
      if (!fromAllowedSite && !(row.allowedIps.length && ipAllowed(ip, row.allowedIps))) {
        const where = host ? `situs ${host}` : `alamat IP ${ip ?? "tidak diketahui"}`;
        return NextResponse.json({ error: `Kunci API ini tidak diizinkan dipakai dari ${where}. Hubungi admin Signalbase.`, forbiddenSource: true }, { status: 403 });
      }
    }
    // Browsers may only read responses on sites the key allows; a key without site rules isn't meant for browsers.
    cors = corsHeaders(origin, fromAllowedSite);

    // A client's key stops with the client: suspended, or its subscription over.
    if (access) {
      if (access.account.status !== "active") return reply(NextResponse.json({ error: "Akun pengguna tidak aktif" }, { status: 403 }));
      if (isExpired(access.account.planExpiresAt)) return reply(NextResponse.json({ error: EXPIRED_MESSAGE, expired: true }, { status: 403 }));
    }

    // Every call is counted per project (and per client for a client's key) for the admin panel.
    const day = jakartaToday();
    await prisma.projectUsage.upsert({ where: { projectId_day: { projectId: row.id, day } }, create: { projectId: row.id, day, count: 1 }, update: { count: { increment: 1 } } });
    if (access) {
      await prisma.projectAccessUsage.upsert({
        where: { projectId_accountId_day: { projectId: row.id, accountId: access.accountId, day } },
        create: { projectId: row.id, accountId: access.accountId, day, count: 1 }, update: { count: { increment: 1 } },
      });
    }
    // Touch at most once a minute.
    const last = access ? access.keyLastUsedAt : row.lastUsedAt;
    if (!last || Date.now() - last.getTime() > 60_000) {
      (access
        ? prisma.projectMember.update({ where: { projectId_accountId: { projectId: row.id, accountId: access.accountId } }, data: { keyLastUsedAt: new Date() } })
        : prisma.project.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })).catch(() => {});
    }
    const limits = limitsFor(null);
    const res = await handler(req, ctx, { keyId: row.id, scope: await withImageCodes(row.id, parseKeyScope(row.scope, row.keywords)), historyDays: limits.historyDays, analysis: limits.analysis });
    return reply(res);
  };
}
