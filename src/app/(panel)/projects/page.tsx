import { ProjectList } from "@/components/projects/ProjectList";
import { staffOnly } from "@/lib/server/staffOnly";

export default async function ProjectsPage() {
  await staffOnly();
  return <ProjectList />;
}
