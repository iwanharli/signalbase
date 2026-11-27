import { PROJECT_COOKIE } from "@/lib/activeProject";

// /projects/<id> that the account cannot open: the active project is cleared and the browser goes to Beranda
// (staff: the whole bank; clients: their first project). A relative Location keeps the public host behind nginx.
export function GET() {
  return new Response(null, {
    status: 307,
    headers: { Location: "/dashboard", "Set-Cookie": `${PROJECT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`, "Cache-Control": "no-store" },
  });
}
