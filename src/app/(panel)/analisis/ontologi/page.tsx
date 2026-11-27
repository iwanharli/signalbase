import { redirect } from "next/navigation";
import { NoProjectYet } from "@/components/media/NoProjectYet";
import { OntologyBoard } from "@/components/ontology/OntologyBoard";
import { allowsType, parseKeyScope } from "@/lib/media/keyScope";
import { getSession, visibleKeys } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { roleOf } from "@/lib/session";

export default async function OntologyPage({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const session = await getSession();
  const isUser = !!session && roleOf(session) === "user";

  // Like the SNA page: users reach the graph only through one of their own projects that may read social media.
  const { key: keyParam } = await searchParams;
  if (isUser && !keyParam) {
    const keys = await prisma.apiKey.findMany({ where: { ...visibleKeys(session.sub), revokedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true, scope: true, keywords: true } });
    const key = keys.find((k) => allowsType(parseKeyScope(k.scope, k.keywords), "social"));
    if (key) redirect(`/analisis/ontologi?key=${key.id}`);
    return <NoProjectYet type="social" label="Ontologi" hasKeys={keys.length > 0} />;
  }
  return <OntologyBoard />;
}
