import { NextResponse } from "next/server";
import { parseSnaDays, parseSnaLimit } from "@/lib/sna";
import { adminRoute } from "@/lib/server/auth";
import { sourceErrorResponse } from "@/lib/server/bank/errors";
import { snaGraph } from "@/lib/server/bank/sna";
import { overviewView } from "@/lib/server/overviewKey";

// SNA page: ?days=1|3|7&limit=25|50|100|200[&key=]. Same key rules as /api/admin/stats (admin: whole bank or one key; user: own key, 403 when the plan expired).
export const GET = adminRoute(async (req: Request, _ctx, _username, user) => {
  const q = new URL(req.url).searchParams;
  const days = parseSnaDays(q.get("days"));
  if (days === null) return NextResponse.json({ error: "days harus 1, 3, atau 7" }, { status: 400 });
  const limit = parseSnaLimit(q.get("limit"));
  if (limit === null) return NextResponse.json({ error: "limit harus 25, 50, 100, atau 200" }, { status: 400 });
  const view = await overviewView(req, user);
  if (view instanceof Response) return view;
  if (view.noKey) return NextResponse.json({ days, nodes: [], links: [] });
  try {
    return NextResponse.json({ days, ...(await snaGraph(days, limit, view.scope)) });
  } catch (e) {
    return sourceErrorResponse(e, "sna");
  }
});
