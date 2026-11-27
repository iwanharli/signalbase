import { redirect } from "next/navigation";
import { ProjectClassifier } from "@/components/classifier/ProjectClassifier";
import { projectSettingsPath } from "@/lib/activeProject";
import { getSession } from "@/lib/server/auth";
import { roleOf } from "@/lib/session";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Viewers are read-only: no AI categorisation settings.
  const session = await getSession();
  if (session && roleOf(session) === "viewer") redirect(projectSettingsPath(id));
  return <ProjectClassifier keyId={id} />;
}
