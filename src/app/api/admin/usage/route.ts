import { NextResponse } from "next/server";
import { jakartaToday } from "@/lib/plans";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";

// Today's public API calls per project, for admins and viewers (the Proyek list). Clients see no usage.
export const GET = adminRoute(async (_req: Request, _ctx, _username, user) => {
  if (user.role === "user") return NextResponse.json({ error: "Khusus admin" }, { status: 403 });
  const day = jakartaToday();
  const rows = await prisma.projectUsage.findMany({ where: { day }, select: { projectId: true, count: true } });
  return NextResponse.json({ day, perKey: Object.fromEntries(rows.map((r) => [r.projectId, r.count])), used: null, limit: null, plan: null });
});
