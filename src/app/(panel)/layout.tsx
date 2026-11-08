import { redirect } from "next/navigation";
import { getSession, isActiveAccount } from "@/lib/server/auth";
import { AiQuotaBanner, PlanBanner } from "@/components/PlanBanner";
import { aiQuota, platformPostsThisMonth } from "@/lib/server/ai/platform";
import { Shell } from "@/components/Shell";
import { accountPlan } from "@/lib/server/plan";
import { daysLeft, isPlanId, PLAN_LABEL } from "@/lib/plans";
import { roleOf } from "@/lib/session";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  // A user whose account was suspended (or never approved) loses the panel even with a valid cookie.
  if (roleOf(session) === "user" && !(await isActiveAccount(session.sub))) redirect("/login?inactive=1");
  const role = roleOf(session);
  const plan = role === "user" ? await accountPlan(session.sub) : null;
  const aiLimit = plan ? await aiQuota(session.sub, plan.limits.aiPostsPerMonth) : null;
  const aiUsed = aiLimit ? await platformPostsThisMonth(session.sub) : 0;
  const banner = plan && <>
    <PlanBanner plan={plan.plan} expiresAt={plan.expiresAt?.toISOString() ?? null} />
    <AiQuotaBanner used={aiUsed} limit={aiLimit} />
  </>;
  return (
    <Shell name={session.name} username={session.username} role={role} banner={banner}
      plan={plan?.plan && isPlanId(plan.plan) ? { label: PLAN_LABEL[plan.plan], daysLeft: daysLeft(plan.expiresAt) } : null}>
      {children}
    </Shell>
  );
}
