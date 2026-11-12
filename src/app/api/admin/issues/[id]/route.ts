import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/server/auth";
import { sourceErrorResponse } from "@/lib/server/bank/errors";
import { findIssue, issueNews } from "@/lib/server/bank/issues";
import { issueView } from "@/lib/server/panelScope";

type Context = { params: Promise<{ id: string }> };

// One issue and its news, newest first (?page=, ?source=). An issue outside the project's keywords is "not found".
export const GET = adminRoute(async (req: Request, { params }: Context, _username, user) => {
  const { id } = await params;
  if (!/^\d{1,18}$/.test(id)) return NextResponse.json({ error: "Isu tidak ditemukan" }, { status: 404 });
  const query = new URL(req.url).searchParams;
  const view = await issueView(query, user);
  if ("response" in view) return view.response;
  const page = Math.max(1, Math.floor(Number(query.get("page"))) || 1);
  try {
    const issue = await findIssue(id, view.keywords);
    if (!issue) return NextResponse.json({ error: "Isu tidak ditemukan" }, { status: 404 });
    return NextResponse.json({ issue, page, ...(await issueNews(id, page, query.get("source") || null)) });
  } catch (e) {
    return sourceErrorResponse(e, "issues/detail");
  }
});
