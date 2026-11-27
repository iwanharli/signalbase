import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/auth";
import { roleOf } from "@/lib/session";
import { LabelAiSettings } from "@/components/labels/LabelAiSettings";

export default async function LabelAiSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Viewers are read-only: no AI label settings.
  const session = await getSession();
  if (session && roleOf(session) === "viewer") redirect(`/project/${id}`);
  return <LabelAiSettings keyId={id} />;
}
