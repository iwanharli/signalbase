import { NextResponse } from "next/server";
import { isSnaRole, parseSnaDays } from "@/lib/sna";
import { adminRoute } from "@/lib/server/auth";
import { sourceErrorResponse } from "@/lib/server/bank/errors";
import { snaAccount } from "@/lib/server/bank/sna";
import { overviewView } from "@/lib/server/overviewKey";

// SNA account panel: ?username=&role=hub|child&days=1|3|7[&key=]. Same key rules as /api/admin/sna.
export const GET = adminRoute(async (req: Request, _ctx, _username, user) => {
  const q = new URL(req.url).searchParams;
  const days = parseSnaDays(q.get("days"));
  if (days === null) return NextResponse.json({ error: "days harus 1, 3, atau 7" }, { status: 400 });
  const username = q.get("username")?.trim() ?? "";
  const role = q.get("role");
  if (!username || username.length > 100 || !isSnaRole(role)) return NextResponse.json({ error: "username dan role (hub/child) wajib" }, { status: 400 });
  const view = await overviewView(req, user);
  if (view instanceof Response) return view;
  if (view.noKey) return NextResponse.json({ posts: [], buckets: [] });
  try {
    return NextResponse.json(await snaAccount(username, role, days, view.scope));
  } catch (e) {
    return sourceErrorResponse(e, "sna-account");
  }
});
