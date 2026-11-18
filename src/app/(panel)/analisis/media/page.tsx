import { redirect } from "next/navigation";
import { MediaVisualBoard } from "@/components/mediaVisual/MediaVisualBoard";
import { getSession } from "@/lib/server/auth";
import { roleOf } from "@/lib/session";

/** Media visual is on trial: admins only (menu, page and API). */
export default async function MediaVisualPage() {
  const session = await getSession();
  if (!session || roleOf(session) !== "admin") redirect("/dashboard");
  return <MediaVisualBoard keyLocked={false} />;
}
