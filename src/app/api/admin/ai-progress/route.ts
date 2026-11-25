import { NextResponse } from "next/server";
import { overallProgress, scopeCountsFor, typeProgress, type TypeCursor } from "@/lib/ai/progress";
import { allowsType, parseKeyScope } from "@/lib/media/keyScope";
import { MEDIA_TYPES, type MediaType } from "@/lib/media/types";
import { adminRoute, visibleKeys } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";

/** A key whose last pass ended this recently counts as being worked on right now (the worker ticks about once a minute). */
const ACTIVE_MS = 3 * 60_000;
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

// AI categorisation progress of every project the account can see that has it switched on: the panel's progress dock.
// Admins (and viewers) see every project, with whose it is; user accounts only their own and those shared with them.
export const GET = adminRoute(async (_req: Request, _ctx, _username, user) => {
  const rows = await prisma.classifier.findMany({
    where: { enabled: true, apiKey: { revokedAt: null, ...(user.role === "user" ? visibleKeys(user.id) : {}) } },
    select: {
      apiKeyId: true, startFrom: true, cursors: true, scopeCounts: true, todayCount: true, todayDate: true, lastRunAt: true, lastError: true,
      apiKey: { select: { name: true, scope: true, keywords: true, ownerId: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const counts = rows.length
    ? await prisma.classification.groupBy({ by: ["apiKeyId", "type"], where: { apiKeyId: { in: rows.map((r) => r.apiKeyId) } }, _count: true })
    : [];
  // Owner names for admins, so projects of different clients can be told apart (null = managed by admins).
  const ownerIds = user.role === "user" ? [] : [...new Set(rows.flatMap((r) => (r.apiKey.ownerId ? [r.apiKey.ownerId] : [])))];
  const owners = new Map((ownerIds.length
    ? await prisma.admin.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true } }) : []).map((a) => [a.id, a.name]));
  const doneOf = (id: string, type: MediaType) => counts.find((c) => c.apiKeyId === id && c.type === type)?._count ?? 0;
  const now = Date.now(), day = today();

  const projects = rows.map((r) => {
    const scope = parseKeyScope(r.apiKey.scope, r.apiKey.keywords);
    const cursors = (r.cursors ?? {}) as Partial<Record<MediaType, TypeCursor>>;
    // The counts the project page last made for this range (same numbers, so both show the same percent).
    const stored = scopeCountsFor(r.scopeCounts, JSON.stringify(scope), r.startFrom ? r.startFrom.toISOString() : "");
    const allowed = MEDIA_TYPES.filter((t) => allowsType(scope, t));
    const totals = allowed.map((t) => stored?.[t] ?? null);
    const types = allowed.map((type, i) =>
      typeProgress({ type, cursor: cursors[type], startFrom: r.startFrom, now, done: doneOf(r.apiKeyId, type), total: totals[i] }));
    return {
      id: r.apiKeyId, name: r.apiKey.name, owner: r.apiKey.ownerId ? owners.get(r.apiKey.ownerId) ?? null : null, ...overallProgress(types, totals), types,
      done: types.reduce((s, t) => s + t.done, 0),
      today: r.todayDate === day ? r.todayCount : 0,
      active: !!r.lastRunAt && now - r.lastRunAt.getTime() < ACTIVE_MS,
      lastRunAt: r.lastRunAt, error: r.lastError,
    };
  });
  return NextResponse.json({ projects }, { headers: { "Cache-Control": "no-store" } });
});
