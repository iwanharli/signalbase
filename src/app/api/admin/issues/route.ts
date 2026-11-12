import { NextResponse } from "next/server";
import { parseIssueDays, parseIssueTopic } from "@/lib/issues";
import { adminRoute } from "@/lib/server/auth";
import { listIssues } from "@/lib/server/bank/issues";
import { sourceErrorResponse } from "@/lib/server/bank/errors";
import { issueView } from "@/lib/server/panelScope";

// Top issues of the last ?days= (3, 7, 14 or 30) in ?topik= (nasional, polisi) as seen through ?key= (users must pass one; admins may omit it).
export const GET = adminRoute(async (req: Request, _ctx, _username, user) => {
  const query = new URL(req.url).searchParams;
  const requested = parseIssueDays(query.get("days"));
  if (!requested) return NextResponse.json({ error: "Periode tidak valid" }, { status: 400 });
  const topic = parseIssueTopic(query.get("topik"));
  if (!topic) return NextResponse.json({ error: "Topik tidak valid" }, { status: 400 });
  const view = await issueView(query, user);
  if ("response" in view) return view.response;
  // A plan's history window also limits how far back issues go.
  const days = view.historyDays ? (Math.min(requested, view.historyDays) as typeof requested) : requested;
  try {
    return NextResponse.json({ days, issues: await listIssues(days, view.keywords, topic) });
  } catch (e) {
    return sourceErrorResponse(e, "issues");
  }
});
