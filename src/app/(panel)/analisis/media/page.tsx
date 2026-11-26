import { redirect } from "next/navigation";
import { MediaVisualBoard } from "@/components/mediaVisual/MediaVisualBoard";
import { NoKeyYet } from "@/components/media/NoKeyYet";
import { getSession, visibleKeys } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { roleOf } from "@/lib/session";

/** Media visual: admins and viewers see the whole bank; users only the images of their own projects (like SNA). */
export default async function MediaVisualPage({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const isUser = roleOf(session) === "user";
  const { key: keyParam } = await searchParams;
  if (isUser && !keyParam) {
    const key = await prisma.apiKey.findFirst({ where: { ...visibleKeys(session.sub), revokedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true } });
    if (key) redirect(`/analisis/media?key=${key.id}`);
    return <NoKeyYet type="social" label="Media visual" hasKeys={false} />;
  }
  return <MediaVisualBoard />;
}
