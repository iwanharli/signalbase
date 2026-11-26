import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/auth";
import { roleOf } from "@/lib/session";

// Projects are set up by admins (viewers may look); clients only use the projects given to them.
export default async function ProjectLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (session && roleOf(session) === "user") redirect("/dashboard");
  return children;
}
