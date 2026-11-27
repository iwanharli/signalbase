import { CommandCenter } from "@/components/commandCenter/CommandCenter";
import { getSession } from "@/lib/server/auth";
import { clientToProject } from "@/lib/server/projectPages";
import { roleOf } from "@/lib/session";

// MAPBOX_TOKEN is read here (server) and handed to the globe; without it the page just has a plain dark background.
/** Whole bank (staff). Clients go to /projects/<id>/command-center. */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getSession();
  const page = <CommandCenter role={session ? roleOf(session) : "admin"} mapToken={process.env.MAPBOX_TOKEN ?? null} />;
  return (await clientToProject("/command-center", await searchParams, null, undefined, page)) ?? page;
}
