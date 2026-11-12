import { CommandCenter } from "@/components/commandCenter/CommandCenter";
import { getSession } from "@/lib/server/auth";
import { roleOf } from "@/lib/session";

// MAPBOX_TOKEN is read here (server) and handed to the globe; without it the page just has a plain dark background.
export default async function Page() {
  const session = await getSession();
  return <CommandCenter role={session ? roleOf(session) : "admin"} mapToken={process.env.MAPBOX_TOKEN ?? null} />;
}
