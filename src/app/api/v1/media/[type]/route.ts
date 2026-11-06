import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/server/apiKey";
import { isType } from "@/lib/server/bank";
import { prisma } from "@/lib/server/db";
import { itemWhere, publicItem } from "@/lib/server/items";

// Public read API: approved items only.
//   GET /api/v1/media/{sosial|online}?from=&to=&q=&source=&mood=&page=&size=
//   GET /api/v1/media/{sosial|online}?view=summary&...   total + split by mood
export const GET = apiRoute(async (req: Request, { params }: { params: Promise<{ type: string }> }) => {
  const { type } = await params;
  if (!isType(type)) return NextResponse.json({ error: "Jenis tidak dikenal: pakai sosial atau online" }, { status: 404 });
  const s = new URL(req.url).searchParams;

  if (s.get("view") === "summary") {
    // The split ignores the mood filter so every slice stays visible; the total honours it.
    const picked = s.get("mood")?.toLowerCase();
    const rest = new URLSearchParams(s);
    rest.delete("mood");
    const groups = await prisma.item.groupBy({ by: ["mood"], where: itemWhere(type, "approved", rest), _count: true });
    const moods = groups.filter((g) => g.mood).map((g) => ({ value: g.mood!, n: g._count })).sort((a, b) => b.n - a.n);
    const all = groups.reduce((t, g) => t + g._count, 0);
    return NextResponse.json({ total: picked ? moods.find((m) => m.value === picked)?.n ?? 0 : all, moods });
  }

  const size = Math.min(100, Math.max(1, Number(s.get("size")) || 24));
  const where = itemWhere(type, "approved", s);
  const total = await prisma.item.count({ where });
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(Math.max(1, Number(s.get("page")) || 1), pages);
  const rows = await prisma.item.findMany({
    where, orderBy: { publishedAt: s.get("sort") === "oldest" ? "asc" : "desc" }, skip: (page - 1) * size, take: size,
  });
  return NextResponse.json({ page, pages, size, total, items: rows.map(publicItem) });
});
