import { redirect } from "next/navigation";
import { Report } from "@/components/laporan/Report";
import { getSession, isActiveAccount } from "@/lib/server/auth";
import { roleOf } from "@/lib/session";

// Print page: outside the panel layout (no top bar). Same session rules as the panel.
export const metadata = { title: "Laporan Eksekutif · Signalbase" };

export default async function LaporanPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (roleOf(session) === "user" && !(await isActiveAccount(session.sub))) redirect("/login?inactive=1");
  return <Report author={session.name} />;
}
