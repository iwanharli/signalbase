import { notFound, redirect } from "next/navigation";
import { MediaBrowser } from "@/components/media/MediaBrowser";
import { NoKeyYet } from "@/components/media/NoKeyYet";
import { allowsType, parseKeyScope } from "@/lib/media/keyScope";
import { isMediaType } from "@/lib/media/types";
import { getSession } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { roleOf } from "@/lib/session";

type Props = { params: Promise<{ type: string }>; searchParams: Promise<{ key?: string }> };

export default async function MediaPage({ params, searchParams }: Props) {
  const { type } = await params;
  if (!isMediaType(type)) notFound();
  const session = await getSession();
  const isUser = !!session && roleOf(session) === "user";

  // Users see media only through one of their own keys: open the first key that covers this type,
  // or explain how to set one up when there is none yet.
  if (isUser && !(await searchParams).key) {
    const keys = await prisma.apiKey.findMany({ where: { ownerId: session.sub, revokedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true, scope: true, keywords: true } });
    const key = keys.find((k) => allowsType(parseKeyScope(k.scope, k.keywords), type));
    if (key) redirect(`/media/${type}?key=${key.id}`);
    return <NoKeyYet type={type} hasKeys={keys.length > 0} />;
  }
  // Keyed by type so switching between the two pages starts with fresh filters.
  return <MediaBrowser key={type} type={type} keyLocked={isUser} />;
}
