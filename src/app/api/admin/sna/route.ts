import { NextResponse } from "next/server";
import { parseSnaDays, parseSnaFlow, parseSnaLimit } from "@/lib/sna";
import { adminRoute } from "@/lib/server/auth";
import { sourceErrorResponse } from "@/lib/server/bank/errors";
import { snaGraph } from "@/lib/server/bank/sna";
import { overviewView } from "@/lib/server/overviewKey";
import { snaCodes } from "@/lib/server/snaFilter";
import { snaIssueGraph } from "@/lib/server/issueClusters/sna";
import { resolveWatch, snaWatchGraph } from "@/lib/server/snaWatch";

// SNA page: ?days=1|3|7&limit=25|50|100|200[&key=][&issue=&label=] (only that project's posts of the issue or label)
// [&watch=<id>] (an SNA watch: only posts matching its keywords too; with view=isu the watch is the one issue node)
// [&flow=langsung|mention|rantai|gelombang] (issue view: how the accounts hang together, see lib/sna buildIssueGraph)
// [&view=isu] (with a project: its issues as nodes and the accounts posting in them, instead of who mentions whom). Same key rules as /api/admin/stats (admin: whole bank or one key; user: own key, 403 when the plan expired).
export const GET = adminRoute(async (req: Request, _ctx, _username, user) => {
  const q = new URL(req.url).searchParams;
  const days = parseSnaDays(q.get("days"));
  if (days === null) return NextResponse.json({ error: "days harus 1, 3, atau 7" }, { status: 400 });
  const limit = parseSnaLimit(q.get("limit"));
  if (limit === null) return NextResponse.json({ error: "limit harus 25, 50, 100, atau 200" }, { status: 400 });
  const view = await overviewView(req, user);
  if (view instanceof Response) return view;
  if (view.noKey) return NextResponse.json({ days, nodes: [], links: [] });
  const only = await snaCodes(q, view.key?.id ?? null);
  if (only instanceof Response) return only;
  const flow = parseSnaFlow(q.get("flow"));
  const watched = await resolveWatch(q, view);
  if (watched instanceof Response) return watched;
  try {
    if (watched) {
      const { watch, scope } = watched;
      return NextResponse.json({ days, ...(q.get("view") === "isu" ? await snaWatchGraph(watch, scope, days, limit, only, flow) : await snaGraph(days, limit, scope, only)) });
    }
    if (q.get("view") === "isu" && view.key) {
      return NextResponse.json({ days, ...(await snaIssueGraph(view.key.id, days, limit, only, q.get("issue")?.trim() || null, flow)) });
    }
    return NextResponse.json({ days, ...(await snaGraph(days, limit, view.scope, only)) });
  } catch (e) {
    return sourceErrorResponse(e, "sna");
  }
});
