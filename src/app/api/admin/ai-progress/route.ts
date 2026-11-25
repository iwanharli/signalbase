import { NextResponse } from "next/server";
import { overallProgress, typeProgress, type TypeCursor } from "@/lib/ai/progress";
import { allowsType, parseKeyScope } from "@/lib/media/keyScope";
import { MEDIA_TYPES, type MediaType } from "@/lib/media/types";
import { CHECKED, labelTotals } from "@/lib/server/ai/labelProgress";
import { adminRoute, visibleKeys } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";

/** A key whose last pass ended this recently counts as being worked on right now (the worker ticks about once a minute). */
const ACTIVE_MS = 3 * 60_000;
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

// Progress of every project the account can see with AI categorisation or AI labelling switched on: the panel's
// progress dock. Categorisation: admins (and viewers) see every project, with whose it is; user accounts only their own
// and those shared with them. Labelling: only those who may manage it (admins and the project's owner).
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
  const labelRows = user.role === "viewer" ? [] : await prisma.labelAi.findMany({
    where: { enabled: true, apiKey: { revokedAt: null, ...(user.role === "user" ? { ownerId: user.id } : {}) } },
    select: {
      apiKeyId: true, startFrom: true, cursors: true, scopeCounts: true, todayCount: true, todayDate: true, dailyLimit: true, lastRunAt: true, lastError: true,
      apiKey: { select: { name: true, scope: true, keywords: true, ownerId: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const labelDone = labelRows.length
    ? await prisma.labelAiItem.groupBy({
      by: ["apiKeyId", "type"], _count: true,
      where: { AND: [CHECKED, { OR: labelRows.map((r) => ({ apiKeyId: r.apiKeyId, ...(r.startFrom ? { publishedAt: { gte: r.startFrom } } : {}) })) }] },
    })
    : [];
  const ownerIds = user.role === "user" ? [] : [...new Set([...rows, ...labelRows].flatMap((r) => (r.apiKey.ownerId ? [r.apiKey.ownerId] : [])))];
  const owners = new Map((ownerIds.length
    ? await prisma.admin.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true } }) : []).map((a) => [a.id, a.name]));
  const doneOf = (id: string, type: MediaType) => counts.find((c) => c.apiKeyId === id && c.type === type)?._count ?? 0;
  const now = Date.now(), day = today();

  const categorisation = rows.map((r) => {
    const scope = parseKeyScope(r.apiKey.scope, r.apiKey.keywords);
    const cursors = (r.cursors ?? {}) as Partial<Record<MediaType, TypeCursor>>;
    const stored = r.scopeCounts as Partial<Record<MediaType, number | null>> | null;
    const types = MEDIA_TYPES.filter((t) => allowsType(scope, t)).map((type) =>
      typeProgress({ type, cursor: cursors[type], startFrom: r.startFrom, now, done: doneOf(r.apiKeyId, type), total: stored?.[type] ?? null }));
    return {
      kind: "category" as const, dailyLimit: null as number | null,
      id: r.apiKeyId, name: r.apiKey.name, owner: r.apiKey.ownerId ? owners.get(r.apiKey.ownerId) ?? null : null, ...overallProgress(types), types,
      done: types.reduce((s, t) => s + t.done, 0),
      today: r.todayDate === day ? r.todayCount : 0,
      active: !!r.lastRunAt && now - r.lastRunAt.getTime() < ACTIVE_MS,
      lastRunAt: r.lastRunAt, error: r.lastError,
    };
  });
  const labelling = labelRows.map((r) => {
    const scope = parseKeyScope(r.apiKey.scope, r.apiKey.keywords);
    const cursors = (r.cursors ?? {}) as Partial<Record<MediaType, TypeCursor>>;
    const stored = (r.scopeCounts as { counts?: Partial<Record<MediaType, number | null>> } | null)?.counts;
    // Keeps the cached post counts fresh; never waited for, since counting the source is slow.
    labelTotals(r.apiKeyId).catch(() => {});
    const types = MEDIA_TYPES.filter((t) => allowsType(scope, t)).map((type) => {
      const done = labelDone.find((c) => c.apiKeyId === r.apiKeyId && c.type === type)?._count ?? 0;
      const total = stored?.[type] ?? null;
      const progress = typeProgress({ type, cursor: cursors[type], startFrom: r.startFrom, now, done, total });
      // By posts, as on the project page, once they have been counted; 100 only when history is walked.
      return progress.state === "backfill" && total ? { ...progress, pct: Math.min(99, Math.floor((done / total) * 100)) } : progress;
    });
    const todayCount = r.todayDate === day ? r.todayCount : 0;
    return {
      kind: "label" as const, dailyLimit: todayCount >= r.dailyLimit ? r.dailyLimit : null,
      id: r.apiKeyId, name: r.apiKey.name, owner: r.apiKey.ownerId ? owners.get(r.apiKey.ownerId) ?? null : null, ...overallProgress(types), types,
      done: types.reduce((s, t) => s + t.done, 0),
      today: todayCount,
      active: !!r.lastRunAt && now - r.lastRunAt.getTime() < ACTIVE_MS,
      lastRunAt: r.lastRunAt, error: r.lastError,
    };
  });
  return NextResponse.json({ projects: [...categorisation, ...labelling] }, { headers: { "Cache-Control": "no-store" } });
});
