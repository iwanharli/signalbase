import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/auth";
import { roleOf } from "@/lib/session";
import { ProjectClassifier } from "@/components/classifier/ProjectClassifier";

export default async function ProjectClassifierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Viewers are read-only: no AI categorisation settings.
  const session = await getSession();
  if (session && roleOf(session) === "viewer") redirect(`/project/${id}`);
  return <ProjectClassifier keyId={id} />;
}
