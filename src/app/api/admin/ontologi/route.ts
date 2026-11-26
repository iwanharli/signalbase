import { NextResponse } from "next/server";
import { parseOntDays } from "@/lib/ontologi";
import { adminRoute } from "@/lib/server/auth";
import { sourceErrorResponse } from "@/lib/server/bank/errors";
import { ontologiIssues } from "@/lib/server/bank/ontologi";
import { projectIssues } from "@/lib/server/isu/ews";
import { overviewView } from "@/lib/server/overviewKey";

// Ontologi and EWS pages: ?days=1|3|7|14|30[&key=]. Same key rules as /api/admin/sna. With a project: its own issues,
// clustered from its posts (server/isu); without: the bank's early-warning alerts.
export const GET = adminRoute(async (req: Request, _ctx, _username, user) => {
  const days = parseOntDays(new URL(req.url).searchParams.get("days"));
  if (days === null) return NextResponse.json({ error: "days harus 1, 3, 7, 14, atau 30" }, { status: 400 });
  const view = await overviewView(req, user);
  if (view instanceof Response) return view;
  if (view.noKey) return NextResponse.json({ days, issues: [] });
  try {
    return NextResponse.json({ days, issues: view.key ? await projectIssues(view.key.id, days) : await ontologiIssues(days, view.scope) });
  } catch (e) {
    return sourceErrorResponse(e, "ontologi");
  }
});
