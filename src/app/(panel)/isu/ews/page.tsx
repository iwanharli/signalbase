import { redirect } from "next/navigation";
import { EwsBoard } from "@/components/ews/EwsBoard";
import { NoKeyYet } from "@/components/media/NoKeyYet";
import { allowsType, parseKeyScope } from "@/lib/media/keyScope";
import { getSession } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { roleOf } from "@/lib/session";

export default async function EwsPage({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const session = await getSession();
  const isUser = !!session && roleOf(session) === "user";

  // Like the other issue pages: users reach alerts only through one of their own projects that may read social media.
  const { key: keyParam } = await searchParams;
  if (isUser && !keyParam) {
    const keys = await prisma.apiKey.findMany({ where: { ownerId: session.sub, revokedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true, scope: true, keywords: true } });
    const key = keys.find((k) => allowsType(parseKeyScope(k.scope, k.keywords), "social"));
    if (key) redirect(`/isu/ews?key=${key.id}`);
    return <NoKeyYet type="social" label="Isu EWS Sosmed" hasKeys={keys.length > 0} />;
  }
  return <EwsBoard keyLocked={isUser} />;
}
