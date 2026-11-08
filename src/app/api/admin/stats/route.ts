import { NextResponse } from "next/server";
import { allowsType, OPEN_SCOPE, parseKeyScope, type KeyScope } from "@/lib/media/keyScope";
import type { MediaType } from "@/lib/media/types";
import { adminRoute, ownsKey } from "@/lib/server/auth";
import { dailyVolume, listItems, moodBreakdown } from "@/lib/server/bank";
import { prisma } from "@/lib/server/db";

const LATEST_PER_TYPE = 4;

// Overview page data: per media type the last 14 days of volume, the mood split of the
// last 7 days and the newest items; plus the active API keys.
// Admins see the whole bank, or one key's view with ?key=. Users always see one of their own keys
// (?key= or their oldest active key) and only their own keys are listed; with no key they get { noKey: true }.
export const GET = adminRoute(async (req: Request, _ctx, _username, user) => {
  const requested = new URL(req.url).searchParams.get("key");
  const isUser = user.role === "user";
  const keys = await prisma.apiKey.findMany({
    where: { revokedAt: null, ...(isUser ? { ownerId: user.id } : {}) },
    orderBy: { createdAt: isUser ? "asc" : "desc" },
    select: { id: true, name: true, keywords: true, scope: true, lastUsedAt: true },
  });

  let key: (typeof keys)[number] | undefined;
  if (requested) {
    if (!(await ownsKey(user, requested))) return NextResponse.json({ error: "Kunci tidak ditemukan" }, { status: 404 });
    key = keys.find((k) => k.id === requested);
    if (!key) return NextResponse.json({ error: "Kunci sudah dicabut" }, { status: 404 });
  } else if (isUser) {
    key = keys[0];
    if (!key) return NextResponse.json({ noKey: true, keys: [], at: new Date().toISOString() });
  }
  const scope: KeyScope = key ? parseKeyScope(key.scope, key.keywords) : OPEN_SCOPE;
  const weekStart = new Date(Date.now() - 6 * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

  const typeStats = async (type: MediaType) => {
    if (!allowsType(scope, type)) return null;
    const [daily, moods, latest] = await Promise.all([
      dailyVolume(type, 14, key ? scope : undefined),
      moodBreakdown(type, new URLSearchParams({ from: weekStart }), scope),
      listItems(type, new URLSearchParams(), scope, { limit: LATEST_PER_TYPE, offset: 0 }),
    ]);
    return { daily, moods, latest };
  };

  try {
    const [social, online] = await Promise.all([typeStats("social"), typeStats("online")]);
    return NextResponse.json({
      social, online,
      key: key ? { id: key.id, name: key.name, keywords: key.keywords } : null,
      keys: keys.map((k) => ({ id: k.id, name: k.name, keywords: k.keywords, lastUsedAt: k.lastUsedAt })),
      at: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
});
