import { NextResponse } from "next/server";
import { parseOntDays } from "@/lib/ontology";
import { adminRoute } from "@/lib/server/auth";
import { sourceErrorResponse } from "@/lib/server/bank/errors";
import { ontologyIssues } from "@/lib/server/bank/ontology";
import { projectIssues } from "@/lib/server/issueClusters/ews";
import { overviewView } from "@/lib/server/overviewKey";

// Ontologi and EWS pages: ?days=1|3|7|14|30[&key=]. Same key rules as /api/admin/sna. With a project: its own issues,
// clustered from its posts (server/issueClusters); without: the bank's early-warning alerts.
export const GET = adminRoute(async (req: Request, _ctx, _username, user) => {
  const days = parseOntDays(new URL(req.url).searchParams.get("days"));
  if (days === null) return NextResponse.json({ error: "days harus 1, 3, 7, 14, atau 30" }, { status: 400 });
  const view = await overviewView(req, user);
  if (view instanceof Response) return view;
  if (view.noKey) return NextResponse.json({ days, issues: [] });
  try {
    return NextResponse.json({ days, issues: view.key ? await projectIssues(view.key.id, days) : await ontologyIssues(days, view.scope) });
  } catch (e) {
    return sourceErrorResponse(e, "ontology");
  }
});
