import { Overview } from "@/components/Overview";
import { getSession } from "@/lib/server/auth";
import { roleOf } from "@/lib/session";

// Admins: the whole bank (or one key with ?key=). Users: their own keys, or onboarding when they have none.
export default async function Page() {
  const session = await getSession();
  return <Overview name={session?.name ?? ""} role={session ? roleOf(session) : "admin"} />;
}
