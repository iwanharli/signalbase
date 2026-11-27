import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/server/auth";
import { KEYWORD_RANGES, keywordCountsForPage } from "@/lib/server/keywordCounts";
import { matchProgress } from "@/lib/server/projectMatches";

type Context = { params: Promise<{ id: string }> };

// Posts and news per keyword of a project over the last 7, 30 or 90 days (?days=, default 30), within the project's other
// restrictions (lib/server/keywordCounts.ts; warmed with the overview).
export const GET = adminRoute(async (req: Request, { params }: Context) => {
  const { id } = await params;
  const asked = Number(new URL(req.url).searchParams.get("days"));
  const days = KEYWORD_RANGES.includes(asked as (typeof KEYWORD_RANGES)[number]) ? asked : 30;
  try {
    // A long keyword list answers { pending: true } while it is counted in the background.
    const result = await keywordCountsForPage(id, days);
    if (!result) return NextResponse.json({ error: "Proyek tidak ditemukan" }, { status: 404 });
    // A long keyword list: how far its stored matches are (projectMatches.ts), shown under the table.
    const matching = await matchProgress(id).catch(() => ({}));
    return NextResponse.json({ ...result, matching });
  } catch {
    return NextResponse.json({ error: "Jumlah post belum bisa dihitung" }, { status: 502 });
  }
});
