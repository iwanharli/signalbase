import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";

// Admin only (ADMIN_ONLY in auth.ts): sales enquiries, open ones first.
export const GET = adminRoute(async () => {
  const rows = await prisma.contactRequest.findMany({ orderBy: [{ handled: "asc" }, { createdAt: "desc" }], take: 200 });
  return NextResponse.json(rows);
});
