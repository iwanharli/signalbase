import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/auth";
import { roleOf } from "@/lib/session";
import { CreateProject } from "@/components/projects/CreateProject";

export default async function NewProjectPage() {
  // Viewers are read-only: no project setup.
  const session = await getSession();
  if (session && roleOf(session) === "viewer") redirect("/project");
  return <CreateProject />;
}
