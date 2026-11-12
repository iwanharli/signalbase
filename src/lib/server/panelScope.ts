import { NextResponse } from "next/server";
import { allowsType, OPEN_SCOPE, parseKeyScope, type KeyScope } from "@/lib/media/keyScope";
import { ownsKey, type PanelUser } from "./auth";
import { prisma } from "./db";
import { accountPlan, EXPIRED_MESSAGE } from "./plan";

/** The scope to browse with: the whole bank, or one API key's view of it when ?key= is given. */
export async function resolveScope(keyId: string | null, user: PanelUser): Promise<{ scope: KeyScope; keyId: string | null } | { error: string; status: number }> {
  // Users only ever see the bank through one of their own keys.
  if (!keyId) return user.role === "user" ? { error: "Pilih proyek dulu", status: 400 } : { scope: OPEN_SCOPE, keyId: null };
  if (!(await ownsKey(user, keyId))) return { error: "Proyek tidak ditemukan", status: 404 };
  const key = await prisma.apiKey.findUnique({ where: { id: keyId }, select: { id: true, scope: true, keywords: true } });
  if (!key) return { error: "Proyek tidak ditemukan", status: 404 };
  return { scope: parseKeyScope(key.scope, key.keywords), keyId: key.id };
}

/** Who may read issues and through which keywords: users only via their own project and within their plan; admins see all. */
export async function issueView(query: URLSearchParams, user: PanelUser): Promise<{ keywords: string[]; historyDays: number | null } | { response: NextResponse }> {
  const fail = (error: string, status: number, extra?: object) => ({ response: NextResponse.json({ error, ...extra }, { status }) });
  let historyDays: number | null = null;
  if (user.role === "user") {
    const plan = await accountPlan(user.id);
    if (plan.expired) return fail(EXPIRED_MESSAGE, 403, { expired: true });
    historyDays = plan.limits.historyDays;
  }
  const resolved = await resolveScope(query.get("key"), user);
  if ("error" in resolved) return fail(resolved.error, resolved.status);
  // Issues are built from online news.
  if (!allowsType(resolved.scope, "online")) return fail("Proyek ini tidak punya akses ke media online", 403);
  return { keywords: resolved.scope.keywords, historyDays };
}
