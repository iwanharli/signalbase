import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute } from "@/lib/server/auth";
import { byCodes } from "@/lib/server/bank";
import { prisma } from "@/lib/server/db";

const Body = z.object({
  type: z.enum(["sosial", "online"]),
  codes: z.array(z.string().min(1).max(200)).min(1).max(100),
  // "pending" puts items back in the queue.
  status: z.enum(["approved", "rejected", "pending"]),
  mood: z.string().trim().toLowerCase().max(40).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

// Approve / reject / reopen. Approving freezes a snapshot of the source row.
export const POST = adminRoute(async (req: Request, _ctx: unknown, user: string) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Data tidak valid" }, { status: 400 });
  const { type, codes, status, mood, note } = parsed.data;

  if (status === "pending") {
    const { count } = await prisma.item.deleteMany({ where: { type, code: { in: codes } } });
    return NextResponse.json({ ok: true, count });
  }

  // Re-reviewing a stored item keeps its snapshot; new ones are read from bankkomen.
  const stored = await prisma.item.findMany({ where: { type, code: { in: codes } } });
  const known = new Set(stored.map((i) => i.code));
  const fresh = await byCodes(type, codes.filter((c) => !known.has(c)));
  const now = new Date();
  await prisma.$transaction([
    ...stored.map((i) => prisma.item.update({
      where: { id: i.id },
      data: { status, reviewedBy: user, reviewedAt: now, ...(mood !== undefined ? { mood: mood || i.moodSource } : {}), ...(note !== undefined ? { note } : {}) },
    })),
    ...fresh.map((b) => prisma.item.create({
      data: {
        type, code: b.code, status, source: b.source, title: b.title, content: b.content, url: b.url, image: b.image,
        postType: b.postType, category: b.category, province: b.province, location: b.location,
        publishedAt: new Date(b.publishedAt), moodSource: b.mood, mood: mood || b.mood, moodLevel: b.moodLevel,
        metrics: b.metrics, note: note ?? null, reviewedBy: user, reviewedAt: now,
      },
    })),
  ]);
  return NextResponse.json({ ok: true, count: stored.length + fresh.length, missing: codes.length - stored.length - fresh.length });
});
