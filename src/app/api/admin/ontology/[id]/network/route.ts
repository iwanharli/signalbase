import { NextResponse } from "next/server";
import { isProjectId } from "@/lib/activeProject";
import { parseSnaFlow } from "@/lib/sna";
import { adminRoute } from "@/lib/server/auth";
import { sourceErrorResponse } from "@/lib/server/bank/errors";
import { prisma } from "@/lib/server/db";
import { socialIssueGraph, type SocialIssuePosts } from "@/lib/server/issueNetwork";
import { overviewView } from "@/lib/server/overviewKey";
import { labelledCodes } from "@/lib/server/snaFilter";

type Context = { params: Promise<{ id: string }> };

// Full-screen SNA of one social issue (Isu Media Sosial), every account, no limit. The id is an early-warning alert's
// cluster (digits, the whole bank) or one of the project's own clusters (UUID, IssueCluster). ?view=isu|mention and
// ?flow=langsung|mention|rantai|gelombang as on the SNA page; ?project= limits it to the project's posts and ?label= to
// those of its posts carrying that label.
export const GET = adminRoute(async (req: Request, { params }: Context, _username, user) => {
  const { id } = await params;
  const notFound = () => NextResponse.json({ error: "Isu tidak ditemukan" }, { status: 404 });
  if (!/^\d{1,18}$/.test(id) && !isProjectId(id)) return notFound();
  const view = await overviewView(req, user);
  if (view instanceof Response) return view;
  if (view.noKey) return NextResponse.json({ sna: { nodes: [], links: [] } });
  let posts: SocialIssuePosts = { cluster: id };
  if (isProjectId(id)) {
    const cluster = await prisma.issueCluster.findUnique({ where: { id }, select: { projectId: true, title: true, keywords: true, codes: true } });
    if (!cluster || cluster.projectId !== view.key?.id) return notFound();
    posts = { title: cluster.title ?? cluster.keywords.slice(0, 4).join(", "), codes: cluster.codes };
  }
  try {
    const q = new URL(req.url).searchParams;
    const label = q.get("label")?.trim();
    const labelled = label && view.key ? await labelledCodes(view.key.id, "social", label) : null;
    return NextResponse.json({ sna: await socialIssueGraph(id, posts, view.scope, q.get("view") === "mention" ? "mention" : "isu", parseSnaFlow(q.get("flow")), labelled) });
  } catch (e) {
    return sourceErrorResponse(e, "ontology/network");
  }
});
