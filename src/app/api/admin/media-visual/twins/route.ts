import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/server/auth";
import { sourceErrorResponse } from "@/lib/server/bank/errors";
import { twinsOf } from "@/lib/server/media/visual";
import { resolveScope } from "@/lib/server/panelScope";

// Media visual: the other images similar to one (same near-duplicate group), each with the newest post using it.
//   ?id=<MediaAsset id> &project=<project>   Users: only within one of their own projects (the image and its twins).
export const GET = adminRoute(async (req: Request, _ctx, _username, user) => {
  const p = new URL(req.url).searchParams;
  const id = p.get("id") ?? "";
  if (!/^[A-Za-z0-9-]{1,64}$/.test(id)) return NextResponse.json({ error: "id tidak valid" }, { status: 400 });
  const resolved = await resolveScope(p.get("project"), user);
  if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  try {
    return NextResponse.json(await twinsOf(id, resolved.keyId));
  } catch (e) {
    return sourceErrorResponse(e, "media visual twins");
  }
});
