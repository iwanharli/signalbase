import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/server/auth";
import { byCodes, candidateCodes, isType } from "@/lib/server/bank";
import { prisma } from "@/lib/server/db";
import { itemWhere } from "@/lib/server/items";

const SIZE = 20;

// Review queue. "pending" reads bankkomen minus what was already reviewed; other statuses read stored items.
export const GET = adminRoute(async (req: Request, { params }: { params: Promise<{ type: string }> }) => {
  const { type } = await params;
  if (!isType(type)) return NextResponse.json({ error: "Jenis tidak dikenal" }, { status: 404 });
  const s = new URL(req.url).searchParams;
  const status = s.get("status") ?? "pending";
  const page = Math.max(1, Number(s.get("page")) || 1);
  try {
    if (status === "pending") {
      const codes = await candidateCodes(type, s);
      const reviewed = new Set((await prisma.item.findMany({ where: { type, code: { in: codes } }, select: { code: true } })).map((r) => r.code));
      const open = codes.filter((c) => !reviewed.has(c));
      const items = await byCodes(type, open.slice((page - 1) * SIZE, page * SIZE));
      return NextResponse.json({ items, page, pages: Math.max(1, Math.ceil(open.length / SIZE)), total: open.length, capped: codes.length >= 3000 });
    }
    const where = itemWhere(type, status, s);
    const [total, rows] = await Promise.all([
      prisma.item.count({ where }),
      prisma.item.findMany({ where, orderBy: { reviewedAt: "desc" }, skip: (page - 1) * SIZE, take: SIZE }),
    ]);
    const items = rows.map((r) => ({ ...r, publishedAt: r.publishedAt.toISOString(), mood: r.mood, moodSource: r.moodSource }));
    return NextResponse.json({ items, page, pages: Math.max(1, Math.ceil(total / SIZE)), total, capped: false });
  } catch (e) {
    return NextResponse.json({ error: `Gagal membaca sumber data: ${(e as Error).message}` }, { status: 502 });
  }
});
