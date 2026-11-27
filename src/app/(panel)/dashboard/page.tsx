import { Overview } from "@/components/overview/Overview";
import { getSession } from "@/lib/server/auth";
import { clientToProject } from "@/lib/server/projectPages";
import { roleOf } from "@/lib/session";

/** Whole bank (staff). Clients go to the Beranda of their first project (/projects/<id>), or see onboarding without one. */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getSession();
  const page = <Overview name={session?.name ?? ""} role={session ? roleOf(session) : "admin"} />;
  return (await clientToProject("/dashboard", await searchParams, null, undefined, page)) ?? page;
}
