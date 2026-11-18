import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/server/auth";
import { sourceErrorResponse } from "@/lib/server/bank/errors";
import { twinsOf } from "@/lib/server/media/visual";

// Media visual: the other images similar to one (same near-duplicate group), each with the newest post using it.
//   ?id=<MediaAsset id>     Admins only, like the page.
export const GET = adminRoute(async (req: Request, _ctx, _username, user) => {
  if (user.role !== "admin") return NextResponse.json({ error: "Fitur ini masih uji coba" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[A-Za-z0-9-]{1,64}$/.test(id)) return NextResponse.json({ error: "id tidak valid" }, { status: 400 });
  try {
    return NextResponse.json(await twinsOf(id));
  } catch (e) {
    return sourceErrorResponse(e, "media visual twins");
  }
});
