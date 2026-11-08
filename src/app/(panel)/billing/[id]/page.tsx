import { notFound, redirect } from "next/navigation";
import { InvoiceView } from "@/components/billing/InvoiceView";
import { billingIssuer } from "@/lib/billing";
import { getSession } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { roleOf } from "@/lib/session";

type Props = { params: Promise<{ id: string }> };

// One invoice, printable. Users see only their own; admins see all.
export default async function Page({ params }: Props) {
  const session = await getSession();
  if (!session) redirect("/login");
  const inv = await prisma.invoice.findUnique({ where: { id: (await params).id }, include: { account: { select: { name: true, username: true } } } });
  if (!inv || (roleOf(session) === "user" && inv.accountId !== session.sub)) notFound();
  return <InvoiceView invoice={JSON.parse(JSON.stringify(inv))} issuer={billingIssuer()} isAdmin={roleOf(session) === "admin"} />;
}
