import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/server/auth";
import { sourceErrorResponse } from "@/lib/server/bank/errors";
import { socialIssueGraph } from "@/lib/server/issueNetwork";
import { overviewView } from "@/lib/server/overviewKey";

type Context = { params: Promise<{ id: string }> };

// Full-screen SNA of one social issue (an early-warning cluster, Isu Media Sosial): every account that posted in it and
// whom they mention, no node limit. ?project= limits it to the project's posts (users: always their project).
export const GET = adminRoute(async (req: Request, { params }: Context, _username, user) => {
  const { id } = await params;
  if (!/^\d{1,18}$/.test(id)) return NextResponse.json({ error: "Isu tidak ditemukan" }, { status: 404 });
  const view = await overviewView(req, user);
  if (view instanceof Response) return view;
  if (view.noKey) return NextResponse.json({ sna: { nodes: [], links: [] } });
  try {
    return NextResponse.json({ sna: await socialIssueGraph(id, view.scope) });
  } catch (e) {
    return sourceErrorResponse(e, "ontology/network");
  }
});
