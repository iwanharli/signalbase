import { redirect } from "next/navigation";
import { AiSettings } from "@/components/aiSettings/AiSettings";
import { getSession } from "@/lib/server/auth";
import { roleOf } from "@/lib/session";

// Admins only: the platform AI behind Ringkasan AI and its cost history.
export default async function AiSettingsPage() {
  const session = await getSession();
  if (!session || roleOf(session) !== "admin") redirect("/dashboard");
  return <AiSettings />;
}
