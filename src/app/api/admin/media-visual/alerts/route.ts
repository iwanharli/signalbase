import { NextResponse } from "next/server";
import { adminRoute, visibleKeys } from "@/lib/server/auth";
import { sourceErrorResponse } from "@/lib/server/bank/errors";
import { prisma } from "@/lib/server/db";
import { mediaAlerts } from "@/lib/server/media/visual";

// Top-bar bell: calls to action, spreading narratives and sensitive images of the last 24 hours.
// Admins and viewers: the whole bank; users: their own projects (and their first one, for the links).
export const GET = adminRoute(async (_req: Request, _ctx, _username, user) => {
  try {
    if (user.role !== "user") return NextResponse.json({ alerts: await mediaAlerts(null), keyId: null });
    const keys = await prisma.apiKey.findMany({ where: { ...visibleKeys(user.id), revokedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true } });
    const ids = keys.map((k) => k.id);
    return NextResponse.json({ alerts: await mediaAlerts(ids), keyId: ids[0] ?? null });
  } catch (e) {
    return sourceErrorResponse(e, "media alerts");
  }
});
