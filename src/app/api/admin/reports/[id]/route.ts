import { NextResponse } from "next/server";
import { adminRoute, ownsKey } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { BANK_SCOPE } from "@/lib/server/report";

// One stored archive report (ReportData). Users may open only reports of their own projects.
export const GET = adminRoute(async (_req: Request, ctx: { params: Promise<{ id: string }> }, _username, user) => {
  const { id } = await ctx.params;
  const row = await prisma.archivedReport.findUnique({ where: { id }, select: { scope: true, data: true } });
  const allowed = row && (user.role !== "user" || (row.scope !== BANK_SCOPE && (await ownsKey(user, row.scope))));
  if (!allowed) return NextResponse.json({ error: "Laporan tidak ditemukan" }, { status: 404 });
  return NextResponse.json(row.data);
});
