import { NextRequest, NextResponse } from "next/server";
import { COOKIE, verifySession } from "@/lib/session";
import { isProjectPage, PROJECT_COOKIE } from "@/lib/activeProject";

// Guards the panel and its API. /api/v1 uses API keys instead (checked in the route).
/** Marketing pages anyone can open. */
const PUBLIC_PAGES = new Set(["/", "/fitur", "/integrasi", "/solusi", "/pricing", "/faq", "/kontak", "/syarat", "/privasi"]);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PAGES.has(pathname) || pathname === "/login" || pathname === "/register" || pathname.startsWith("/api/auth/") || pathname === "/api/contact" || pathname.startsWith("/api/v1/")) return NextResponse.next();
  if (await verifySession(req.cookies.get(COOKIE)?.value)) return pageWithProject(req);
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.redirect(new URL("/login", publicOrigin(req)));
}

// Project pages follow the project picked in the top bar: ?key= in the URL becomes the active project,
// and a page opened without one gets the active project added.
function pageWithProject(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  if (pathname.startsWith("/api/") || !isProjectPage(pathname)) return NextResponse.next();
  const key = searchParams.get("key"), saved = req.cookies.get(PROJECT_COOKIE)?.value;
  if (!key && saved) {
    const next = new URLSearchParams(searchParams);
    next.set("key", saved);
    return NextResponse.redirect(new URL(`${pathname}?${next}`, publicOrigin(req)));
  }
  const res = NextResponse.next();
  if (key && key !== saved) res.cookies.set(PROJECT_COOKIE, key, { path: "/", maxAge: 31_536_000, sameSite: "lax" });
  return res;
}

// Behind nginx req.url carries the internal host; rebuild the public origin from proxy headers.
function publicOrigin(req: NextRequest) {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() || req.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}`;
}

// Static files in public/ that anyone may fetch (logo, icon, the product-knowledge PDF) skip the sign-in check.
export const config = { matcher: ["/((?!_next/|favicon|logo|icon|signalbase-product-knowledge\\.pdf).*)"] };
