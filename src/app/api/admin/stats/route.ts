import { NextResponse } from "next/server";
import { parseKeyScope } from "@/lib/media/keyScope";
import { adminRoute, ownsKey } from "@/lib/server/auth";
import { sourceErrorResponse } from "@/lib/server/bank/errors";
import { prisma } from "@/lib/server/db";
import { typeStats } from "@/lib/server/overview";
import { accountPlan, EXPIRED_MESSAGE } from "@/lib/server/plan";

// Overview page data: per media type the last 14 days of volume, the mood split of the
// last 7 days and the newest items; plus the active API keys.
// Admins see the whole bank, or one key's view with ?key=. Users always see one of their own keys
// (?key= or their oldest active key) and only their own keys are listed; with no key they get { noKey: true }.
export const GET = adminRoute(async (req: Request, _ctx, _username, user) => {
  const requested = new URL(req.url).searchParams.get("key");
  const isUser = user.role === "user";
  if (isUser && (await accountPlan(user.id)).expired) return NextResponse.json({ error: EXPIRED_MESSAGE, expired: true }, { status: 403 });
  const keys = await prisma.apiKey.findMany({
    where: { revokedAt: null, ...(isUser ? { ownerId: user.id } : {}) },
    orderBy: { createdAt: isUser ? "asc" : "desc" },
    select: { id: true, name: true, keywords: true, scope: true, lastUsedAt: true },
  });

  let key: (typeof keys)[number] | undefined;
  if (requested) {
    if (!(await ownsKey(user, requested))) return NextResponse.json({ error: "Proyek tidak ditemukan" }, { status: 404 });
    key = keys.find((k) => k.id === requested);
    if (!key) return NextResponse.json({ error: "Proyek sudah dicabut" }, { status: 404 });
  } else if (isUser) {
    key = keys[0];
    if (!key) return NextResponse.json({ noKey: true, keys: [], at: new Date().toISOString() });
  }
  const scope = key ? parseKeyScope(key.scope, key.keywords) : undefined;

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
