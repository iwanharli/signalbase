import { redirect } from "next/navigation";
import { CreateProject } from "@/components/projects/CreateProject";
import { getSession } from "@/lib/server/auth";
import { staffOnly } from "@/lib/server/staffOnly";
import { roleOf } from "@/lib/session";

export default async function NewProjectPage() {
  await staffOnly();
  // Viewers are read-only: no project setup.
  const session = await getSession();
  if (session && roleOf(session) === "viewer") redirect("/projects");
  return <CreateProject />;
}
