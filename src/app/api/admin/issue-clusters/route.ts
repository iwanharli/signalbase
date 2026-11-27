import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { overviewView } from "@/lib/server/overviewKey";

const SHOWN = 30;

// Issues found by clustering one project's social posts (worker `isu`), highest score first. ?project= is required; the same
// key rules as the EWS list (/api/admin/ontology): users only see their own projects.
export const GET = adminRoute(async (req: Request, _ctx, _username, user) => {
  const view = await overviewView(req, user);
  if (view instanceof Response) return view;
  if (!view.key) return NextResponse.json({ issues: [], updatedAt: null });
  const rows = await prisma.issueCluster.findMany({
    where: { projectId: view.key.id, active: true },
    orderBy: { score: "desc" },
    take: SHOWN,
    select: {
      id: true, posts: true, authors: true, negShare: true, growth: true, score: true, keywords: true, perDay: true, moods: true, samples: true,
      title: true, summary: true, actors: true, targets: true, firstSeen: true, lastSeen: true, updatedAt: true,
    },
  });
  const updatedAt = rows.reduce<Date | null>((max, r) => (!max || r.updatedAt > max ? r.updatedAt : max), null);
  return NextResponse.json({ issues: rows, updatedAt });
});
