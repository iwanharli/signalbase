import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/auth";
import { Shell } from "@/components/Shell";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  return <Shell name={session.name}>{children}</Shell>;
}
