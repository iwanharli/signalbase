import { requireProject } from "@/lib/server/projectPages";

/** Every /projects/<id>/… page: the project must exist and be visible to the account. */
export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  await requireProject((await params).id);
  return children;
}
