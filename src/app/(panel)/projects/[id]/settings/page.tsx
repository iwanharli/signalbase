import { ProjectDetail } from "@/components/projects/ProjectDetail";

export default async function ProjectSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProjectDetail key={id} keyId={id} />;
}
