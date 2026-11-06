import { NextResponse } from "next/server";
import type { MediaType } from "@/lib/media/types";
import { adminRoute } from "@/lib/server/auth";
import { dailyVolume, listItems, moodBreakdown } from "@/lib/server/bank";
import { prisma } from "@/lib/server/db";

const LATEST_PER_TYPE = 4;

// Overview page data: per media type the last 14 days of volume, the mood split of the
// last 7 days and the newest items; plus the active API keys.
export const GET = adminRoute(async () => {
  const weekStart = new Date(Date.now() - 6 * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

  const typeStats = async (type: MediaType) => {
    const [daily, moods, latest] = await Promise.all([
      dailyVolume(type),
      moodBreakdown(type, new URLSearchParams({ from: weekStart }), []),
      listItems(type, new URLSearchParams(), [], { limit: LATEST_PER_TYPE, offset: 0 }),
    ]);
    return { daily, moods, latest };
  };

  try {
    const [social, online, keys] = await Promise.all([
      typeStats("social"),
      typeStats("online"),
      prisma.apiKey.findMany({
        where: { revokedAt: null },
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, keywords: true, lastUsedAt: true },
      }),
    ]);
    return NextResponse.json({ social, online, keys, at: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
});
