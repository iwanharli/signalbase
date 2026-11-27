import { CommandCenter } from "@/components/commandCenter/CommandCenter";
import { getSession } from "@/lib/server/auth";
import { roleOf } from "@/lib/session";

export default async function Page() {
  const session = await getSession();
  return <CommandCenter role={session ? roleOf(session) : "admin"} mapToken={process.env.MAPBOX_TOKEN ?? null} />;
}
