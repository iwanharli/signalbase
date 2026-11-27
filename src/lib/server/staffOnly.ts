import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/auth";
import { roleOf } from "@/lib/session";

/** Project settings are for staff (admins set projects up, viewers may look); clients only use the projects given to them. */
export async function staffOnly() {
  const session = await getSession();
  if (session && roleOf(session) === "user") redirect("/dashboard");
}
