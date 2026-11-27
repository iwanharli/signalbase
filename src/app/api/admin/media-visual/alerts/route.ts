import { NextResponse } from "next/server";
import { adminRoute, visibleKeys } from "@/lib/server/auth";
import { sourceErrorResponse } from "@/lib/server/bank/errors";
import { prisma } from "@/lib/server/db";
import { mediaAlerts } from "@/lib/server/media/visual";
import { ALERT_DAYS } from "@/lib/mediaVisual";

/** Most of each kind on the notifications page. */
const ALERTS_PAGE_PER_KIND = 60;

// Top-bar bell: calls to action, spreading narratives and sensitive images of the last 24 hours. The notifications page
// adds ?days=1|3|7|30 for a longer window and more of each kind.
// Admins and viewers: the whole bank; users: their own projects (and their first one, for the links).
export const GET = adminRoute(async (req: Request, _ctx, _username, user) => {
  const days = Number(new URL(req.url).searchParams.get("days"));
  const opts = ALERT_DAYS.includes(days as (typeof ALERT_DAYS)[number]) ? { hours: days * 24, perKind: ALERTS_PAGE_PER_KIND } : {};
  try {
    if (user.role !== "user") return NextResponse.json({ alerts: await mediaAlerts(null, opts), keyId: null });
    const keys = await prisma.project.findMany({ where: { ...visibleKeys(user.id), revokedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true } });
    const ids = keys.map((k) => k.id);
    return NextResponse.json({ alerts: await mediaAlerts(ids, opts), keyId: ids[0] ?? null });
  } catch (e) {
    return sourceErrorResponse(e, "media alerts");
  }
});
