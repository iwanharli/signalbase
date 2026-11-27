import { NextResponse } from "next/server";
import { parseIssueTopic } from "@/lib/issues";
import { adminRoute } from "@/lib/server/auth";
import { sourceErrorResponse } from "@/lib/server/bank/errors";
import { findIssue } from "@/lib/server/bank/issues";
import { onlineIssueGraph } from "@/lib/server/issueNetwork";
import { issueView, resolveScope } from "@/lib/server/panelScope";
import { labelledCodes } from "@/lib/server/snaFilter";

type Context = { params: Promise<{ id: string }> };

// Full-screen network of one news issue (Isu Media Online): { sna, ontology }, no node limit. Same access as the issue
// itself (?project=, ?topik=): an issue outside the project's view is "not found".
export const GET = adminRoute(async (req: Request, { params }: Context, _username, user) => {
  const { id } = await params;
  if (!/^\d{1,18}$/.test(id)) return NextResponse.json({ error: "Isu tidak ditemukan" }, { status: 404 });
  const query = new URL(req.url).searchParams;
  const topic = parseIssueTopic(query.get("topik"));
  if (!topic) return NextResponse.json({ error: "Topik tidak valid" }, { status: 400 });
  const view = await issueView(query, user);
  if ("response" in view) return view.response;
  try {
    const issue = await findIssue(id, view.keywords, topic);
    if (!issue) return NextResponse.json({ error: "Isu tidak ditemukan" }, { status: 404 });
    const label = query.get("label")?.trim();
    const resolved = label ? await resolveScope(query.get("project") ?? query.get("key"), user) : null;
    const projectId = resolved && "keyId" in resolved ? resolved.keyId : null;
    return NextResponse.json(await onlineIssueGraph(issue, label && projectId ? await labelledCodes(projectId, "online", label) : null));
  } catch (e) {
    return sourceErrorResponse(e, "issues/network");
  }
});
