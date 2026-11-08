import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/auth";
import { Shell } from "@/components/Shell";
import { roleOf } from "@/lib/session";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  return <Shell name={session.name} role={roleOf(session)}>{children}</Shell>;
}
