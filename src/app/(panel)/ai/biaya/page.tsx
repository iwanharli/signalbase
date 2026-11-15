import { redirect } from "next/navigation";
import { AiCosts } from "@/components/aiSettings/AiCosts";
import { getSession } from "@/lib/server/auth";
import { roleOf } from "@/lib/session";

// Admins only: AI costs paid by Signalbase's own provider key (clients' own keys, e.g. KIPERMAS, are not counted).
export default async function AiCostsPage() {
  const session = await getSession();
  if (!session || roleOf(session) !== "admin") redirect("/dashboard");
  return <AiCosts />;
}
