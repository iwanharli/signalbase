import { NextResponse } from "next/server";
import { MEDIA_TYPES, type MediaItem } from "@/lib/media/types";
import { fetchItemsByCode } from "@/lib/server/bank";
import { labelAiBlocked } from "@/lib/server/ai/labelAi";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";

type Context = { params: Promise<{ id: string }> };
const SHOWN = 50;

// Posts AI labelling failed on, newest first.
export const GET = adminRoute(async (_req: Request, { params }: Context, _username, user) => {
  const { id } = await params;
  const blocked = await labelAiBlocked(user, id);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 403 });
  const where = { projectId: id, status: "failed" };
  const [total, rows] = await Promise.all([
    prisma.labelAiItem.count({ where }),
    prisma.labelAiItem.findMany({ where, orderBy: { updatedAt: "desc" }, take: SHOWN }),
  ]);
  // The reasons are still worth showing when the source can't be read.
  const posts = (await Promise.all(MEDIA_TYPES.map((t) => {
    const codes = rows.filter((r) => r.type === t).map((r) => r.code);
    return codes.length ? fetchItemsByCode(t, codes).then((items) => items.map((i): [string, MediaItem] => [`${t}:${i.code}`, i])).catch(() => []) : [];
  }))).flat();
  const byKey = new Map(posts);
  return NextResponse.json({
    total,
    items: rows.map((r) => {
      const post = byKey.get(`${r.type}:${r.code}`);
      return { type: r.type, code: r.code, error: r.error, attempts: r.attempts, source: post?.source ?? null, publishedAt: r.publishedAt, text: (post?.title || post?.content || "").slice(0, 240) };
    }),
  }, { headers: { "Cache-Control": "no-store" } });
});

// Queues every failed post for the worker again, with a fresh set of attempts. Nothing is sent from here.
export const POST = adminRoute(async (_req: Request, { params }: Context, _username, user) => {
  const { id } = await params;
  const blocked = await labelAiBlocked(user, id);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 403 });
  const { count } = await prisma.labelAiItem.updateMany({ where: { projectId: id, status: "failed" }, data: { attempts: 0, retryAfter: new Date() } });
  return NextResponse.json({ queued: count });
});
