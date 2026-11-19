import { NextResponse } from "next/server";
import { isVisualKind, parseVisualCursor, parseVisualDays, parseVisualView, VISUAL_TAGS } from "@/lib/mediaVisual";
import { adminRoute } from "@/lib/server/auth";
import { sourceErrorResponse } from "@/lib/server/bank/errors";
import { visualPage, workerStatus } from "@/lib/server/media/visual";
import { resolveScope } from "@/lib/server/panelScope";

// Media visual (Analisis → Media visual): analysed images of the period, newest first.
//   ?view=post|image (one card per post, default; or per image)
//   &days=1|3|7|30 &kind=news|x_photo|x_video|youtube|instagram|threads &tag= &sensitive=1 &text=1 &q= (text in the image) &key= (project)
//   &action=1 (calls to action) &claims=1 (numeric claims) &unread=1 (text in a script OCR can't read) &narrative=<key> (one shared narrative); view=narrative lists them
//   &after=<cursor of the previous page> (keyset paging: images arriving while scrolling don't shift the pages)
// On trial: admins only (the page and the menu entry are hidden from everyone else too).
export const GET = adminRoute(async (req: Request, _ctx, _username, user) => {
  if (user.role !== "admin") return NextResponse.json({ error: "Fitur ini masih uji coba" }, { status: 403 });
  const p = new URL(req.url).searchParams;
  const days = parseVisualDays(p.get("days"));
  const resolved = await resolveScope(p.get("key"), user);
  if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  const kind = p.get("kind");
  const tag = p.get("tag");
  try {
    const [res, worker] = await Promise.all([visualPage({
      view: parseVisualView(p.get("view")), days, kind: isVisualKind(kind) ? kind : null, tag: tag && tag in VISUAL_TAGS ? tag : null,
      sensitive: p.get("sensitive") === "1", text: p.get("text") === "1", q: (p.get("q") ?? "").trim().slice(0, 100),
      after: parseVisualCursor(p.get("after")),
      action: p.get("action") === "1", claims: p.get("claims") === "1", unread: p.get("unread") === "1",
      narrative: /^[a-z0-9 ]{8,200}$/.test(p.get("narrative") ?? "") ? p.get("narrative") : null,
    }, resolved.keyId), workerStatus()]);
    return NextResponse.json({ days, ...res, worker });
  } catch (e) {
    return sourceErrorResponse(e, "media visual");
  }
});
