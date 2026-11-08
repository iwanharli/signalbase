import { redirect } from "next/navigation";
import { UserList } from "@/components/users/UserList";
import { getSession } from "@/lib/server/auth";
import { roleOf } from "@/lib/session";

// Admins only: approve sign-ups and manage user accounts.
export default async function UsersPage() {
  const session = await getSession();
  if (!session || roleOf(session) !== "admin") redirect("/dashboard");
  return <UserList />;
}
