import { redirect } from "next/navigation";
import { getSession, isActiveAccount } from "@/lib/server/auth";
import { AccessEnded } from "@/components/AccessEnded";
import { Shell } from "@/components/Shell";
import { accountPlan } from "@/lib/server/plan";
import { roleOf } from "@/lib/session";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  // A client whose account was suspended (or never approved) loses the panel even with a valid cookie.
  if (roleOf(session) === "user" && !(await isActiveAccount(session.sub))) redirect("/login?inactive=1");
  const role = roleOf(session);
  // A client whose subscription ended sees one notice instead of pages whose data it may no longer read.
  const ended = role === "user" && (await accountPlan(session.sub)).expired;
  return (
    <Shell name={session.name} username={session.username} role={role}>
      {ended ? <AccessEnded /> : children}
    </Shell>
  );
}
