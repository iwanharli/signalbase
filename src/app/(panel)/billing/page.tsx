import { redirect } from "next/navigation";
import { BillingPage } from "@/components/billing/BillingPage";
import { getSession } from "@/lib/server/auth";
import { accountPlan } from "@/lib/server/plan";
import { BILLING_VISIBLE } from "@/lib/plans";
import { roleOf } from "@/lib/session";

// User accounts: their plan and invoices. Admins manage invoices from the Pengguna page.
export default async function Page() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (roleOf(session) !== "user") redirect("/users#tagihan");
  const plan = await accountPlan(session.sub);
  if (plan.demo || !BILLING_VISIBLE) redirect("/dashboard"); // demo accounts have no billing; nor anyone while it is hidden
  const canTopup = !!plan.plan && !!plan.limits.aiPostsPerMonth && plan.limits.ownAiKey && !plan.expired;
  return <BillingPage plan={plan.plan} expiresAt={plan.expiresAt?.toISOString() ?? null} canTopup={canTopup} />;
}
