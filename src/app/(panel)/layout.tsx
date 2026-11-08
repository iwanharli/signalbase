import { redirect } from "next/navigation";
import { getSession, isActiveAccount } from "@/lib/server/auth";
import { Shell } from "@/components/Shell";
import { roleOf } from "@/lib/session";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  // A user whose account was suspended (or never approved) loses the panel even with a valid cookie.
  if (roleOf(session) === "user" && !(await isActiveAccount(session.sub))) redirect("/login?inactive=1");
  return <Shell name={session.name} role={roleOf(session)}>{children}</Shell>;
}
