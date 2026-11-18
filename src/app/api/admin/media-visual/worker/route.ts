import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/server/auth";
import { workerStatus } from "@/lib/server/media/visual";

// Media worker health for the alert in the top bar (admins): heartbeat, whether the analysis service answered, last error.
export const GET = adminRoute(async (_req: Request, _ctx, _username, user) => {
  if (user.role !== "admin") return NextResponse.json({ error: "Khusus admin" }, { status: 403 });
  return NextResponse.json({ worker: await workerStatus().catch(() => null) });
});
