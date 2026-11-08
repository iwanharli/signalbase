import { redirect } from "next/navigation";
import { getSession, isActiveAccount } from "@/lib/server/auth";
import { PlanBanner } from "@/components/PlanBanner";
import { Shell } from "@/components/Shell";
import { accountPlan } from "@/lib/server/plan";
import { roleOf } from "@/lib/session";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  // A user whose account was suspended (or never approved) loses the panel even with a valid cookie.
  if (roleOf(session) === "user" && !(await isActiveAccount(session.sub))) redirect("/login?inactive=1");
  const role = roleOf(session);
  const plan = role === "user" ? await accountPlan(session.sub) : null;
  return (
    <Shell name={session.name} role={role} banner={plan && <PlanBanner plan={plan.plan} expiresAt={plan.expiresAt?.toISOString() ?? null} />}>
      {children}
    </Shell>
  );
}
