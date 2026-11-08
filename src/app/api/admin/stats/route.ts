import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/server/auth";
import { sourceErrorResponse } from "@/lib/server/bank/errors";
import { typeStats } from "@/lib/server/overview";
import { overviewView } from "@/lib/server/overviewKey";

// Overview page data: per media type the last 14 days of volume, the mood split of the
// last 7 days and the newest items; plus the active API keys.
// Admins see the whole bank, or one key's view with ?key=. Users always see one of their own keys
// (?key= or their oldest active key) and only their own keys are listed; with no key they get { noKey: true }.
export const GET = adminRoute(async (req: Request, _ctx, _username, user) => {
  const view = await overviewView(req, user);
  if (view instanceof Response) return view;
  if (view.noKey) return NextResponse.json({ noKey: true, keys: [], at: new Date().toISOString() });
  const { key, keys, scope } = view;
  try {
    const [social, online] = await Promise.all([typeStats("social", scope), typeStats("online", scope)]);
    return NextResponse.json({
      social, online,
      key: key ? { id: key.id, name: key.name, keywords: key.keywords } : null,
      keys: keys.map((k) => ({ id: k.id, name: k.name, keywords: k.keywords, lastUsedAt: k.lastUsedAt })),
      at: new Date().toISOString(),
    });
  } catch (e) {
    return sourceErrorResponse(e, "overview");
  }
});
