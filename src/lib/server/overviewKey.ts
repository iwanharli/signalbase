// Which key the Ringkasan / Beranda page looks through. Shared by its stats and insights APIs so both agree.
import { NextResponse } from "next/server";
import { parseKeyScope, type KeyScope } from "@/lib/media/keyScope";
import { canSeeKey, visibleKeys, type PanelUser } from "./auth";
import { prisma } from "./db";
import { accountPlan, EXPIRED_MESSAGE } from "./plan";
import { withImageCodes } from "./media/textSignals";

type KeyRow = { id: string; name: string; keywords: string[]; scope: unknown; lastUsedAt: Date | null };
export type OverviewView = { keys: KeyRow[]; key: KeyRow | null; scope: KeyScope | undefined; noKey: boolean };

/** Admins: the whole bank, or one key with ?project=. Users: one of their own keys (?project= or their oldest active one).
 *  Returns a Response for an expired plan or a key the caller may not see. */
export async function overviewView(req: Request, user: PanelUser): Promise<OverviewView | Response> {
  const requested = new URL(req.url).searchParams.get("project");
  const isUser = user.role === "user";
  if (isUser && (await accountPlan(user.id)).expired) return NextResponse.json({ error: EXPIRED_MESSAGE, expired: true }, { status: 403 });
  const keys = await prisma.project.findMany({
    where: { revokedAt: null, ...(isUser ? visibleKeys(user.id) : {}) },
    orderBy: { createdAt: isUser ? "asc" : "desc" },
    select: { id: true, name: true, keywords: true, scope: true, lastUsedAt: true },
  });
  let key: KeyRow | undefined;
  if (requested) {
    if (!(await canSeeKey(user, requested))) return NextResponse.json({ error: "Proyek tidak ditemukan" }, { status: 404 });
    key = keys.find((k) => k.id === requested);
    if (!key) return NextResponse.json({ error: "Proyek sudah dicabut" }, { status: 404 });
  } else if (isUser) {
    key = keys[0];
  }
  return { keys, key: key ?? null, scope: key ? await withImageCodes(key.id, parseKeyScope(key.scope, key.keywords)) : undefined, noKey: isUser && !key };
}
