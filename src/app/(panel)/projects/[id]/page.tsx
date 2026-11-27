import { Overview } from "@/components/overview/Overview";
import { getSession } from "@/lib/server/auth";
import { roleOf } from "@/lib/session";

/** Beranda of one project. */
export default async function Page() {
  const session = await getSession();
  return <Overview name={session?.name ?? ""} role={session ? roleOf(session) : "admin"} />;
}
