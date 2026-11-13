import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/auth";
import { roleOf } from "@/lib/session";
import { CreateApiKey } from "@/components/apiKeys/CreateApiKey";

export default async function NewApiKeyPage() {
  // Viewers are read-only: no project setup.
  const session = await getSession();
  if (session && roleOf(session) === "viewer") redirect("/api-keys");
  return <CreateApiKey />;
}
