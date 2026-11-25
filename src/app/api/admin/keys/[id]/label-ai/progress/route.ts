import { NextResponse } from "next/server";
import { labelAiBlocked } from "@/lib/server/ai/labelAi";
import { labelProgress, labelTotals } from "@/lib/server/ai/labelProgress";
import { adminRoute } from "@/lib/server/auth";

type Context = { params: Promise<{ id: string }> };
const noStore = { headers: { "Cache-Control": "no-store" } };

// Progress of AI labelling. ?view=totals counts the posts in range separately, because the source database is slow.
export const GET = adminRoute(async (req: Request, { params }: Context, _username, user) => {
  const { id } = await params;
  const blocked = await labelAiBlocked(user, id);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 403 });
  if (new URL(req.url).searchParams.get("view") !== "totals") return NextResponse.json({ progress: await labelProgress(id) }, noStore);
  try {
    return NextResponse.json({ totals: await labelTotals(id) }, noStore);
  } catch {
    return NextResponse.json({ error: "Jumlah data belum bisa dihitung" }, { status: 502 });
  }
});
