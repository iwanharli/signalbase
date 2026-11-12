import { redirect } from "next/navigation";
import { IssueBoard } from "@/components/issues/IssueBoard";
import { NoKeyYet } from "@/components/media/NoKeyYet";
import { allowsType, parseKeyScope } from "@/lib/media/keyScope";
import { getSession } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { roleOf } from "@/lib/session";

export default async function IssuesPage({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const session = await getSession();
  const isUser = !!session && roleOf(session) === "user";

  // Like the media pages: users see issues only through one of their own projects that may read online media.
  if (isUser && !(await searchParams).key) {
    const keys = await prisma.apiKey.findMany({ where: { ownerId: session.sub, revokedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true, scope: true, keywords: true } });
    const key = keys.find((k) => allowsType(parseKeyScope(k.scope, k.keywords), "online"));
    if (key) redirect(`/isu?key=${key.id}`);
    return <NoKeyYet type="online" label="Isu" hasKeys={keys.length > 0} />;
  }
  return <IssueBoard keyLocked={isUser} />;
}
