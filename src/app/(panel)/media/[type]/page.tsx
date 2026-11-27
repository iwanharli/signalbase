import { notFound, redirect } from "next/navigation";
import { MediaBrowser } from "@/components/media/MediaBrowser";
import { NoProjectYet } from "@/components/media/NoProjectYet";
import { allowsType, parseKeyScope } from "@/lib/media/keyScope";
import { isMediaType } from "@/lib/media/types";
import { getSession, visibleKeys } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { roleOf } from "@/lib/session";

type Props = { params: Promise<{ type: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function MediaPage({ params, searchParams }: Props) {
  const { type } = await params;
  if (!isMediaType(type)) notFound();
  const query = await searchParams;
  if (typeof query.project === "string") {
    const next = new URLSearchParams(Object.entries(query).filter((e): e is [string, string] => typeof e[1] === "string"));
    if (!next.get("key")) next.set("key", query.project);
    next.delete("project");
    redirect(`/media/${type}?${next}`);
  }
  const session = await getSession();
  const isUser = !!session && roleOf(session) === "user";

  // Users see media only through one of their own keys: open the first key that covers this type,
  // or explain how to set one up when there is none yet.
  if (isUser && !query.key) {
    const keys = await prisma.apiKey.findMany({ where: { ...visibleKeys(session.sub), revokedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true, scope: true, keywords: true } });
    const key = keys.find((k) => allowsType(parseKeyScope(k.scope, k.keywords), type));
    if (key) redirect(`/media/${type}?key=${key.id}`);
    return <NoProjectYet type={type} hasKeys={keys.length > 0} />;
  }
  // Keyed by type so switching between the two pages starts with fresh filters.
  return <MediaBrowser key={type} type={type} />;
}
