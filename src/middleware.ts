import { NextRequest, NextResponse } from "next/server";
import { COOKIE, verifySession } from "@/lib/session";
import { isProjectId, isProjectPage, legacyProjectUrl, PROJECT_COOKIE, projectPath, splitProjectPath } from "@/lib/activeProject";

// Guards the panel and its API. /api/v1 uses API keys instead (checked in the route).
/** Marketing pages anyone can open. */
const PUBLIC_PAGES = new Set(["/", "/features", "/integration", "/solutions", "/pricing", "/faq", "/contact", "/terms", "/privacy"]);

export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  // Addresses from before 27 Nov 2026 (Indonesian paths, ?key=, /project/…) move first, signed in or not.
  const legacy = pathname.startsWith("/api/") ? null : legacyProjectUrl(pathname, searchParams);
  if (legacy) return NextResponse.redirect(new URL(legacy, publicOrigin(req)));
  if (PUBLIC_PAGES.has(pathname) || pathname === "/login" || pathname === "/register" || pathname.startsWith("/api/auth/") || pathname === "/api/contact" || pathname.startsWith("/api/v1/")) return NextResponse.next();
  if (await verifySession(req.cookies.get(COOKIE)?.value)) return pageWithProject(req);
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.redirect(new URL("/login", publicOrigin(req)));
}

// Project pages follow the project picked in the top bar: /projects/<id>/… makes <id> the active project, and a whole-bank
// data page opened while a project is active moves to that project's page.
function pageWithProject(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  if (pathname.startsWith("/api/")) return NextResponse.next();
  // A cookie that is not a project id (an old bad link) is ignored, so it can never send every page to a 404.
  const cookie = req.cookies.get(PROJECT_COOKIE)?.value;
  const saved = isProjectId(cookie) ? cookie : undefined;
  if (isProjectPage(pathname) && saved) {
    const qs = searchParams.toString();
    return NextResponse.redirect(new URL(`${projectPath(saved, pathname)}${qs ? `?${qs}` : ""}`, publicOrigin(req)));
  }
  const { id, page } = splitProjectPath(pathname);
  const res = NextResponse.next();
  if (isProjectId(id) && id !== saved && isProjectPage(page)) res.cookies.set(PROJECT_COOKIE, id, { path: "/", maxAge: 31_536_000, sameSite: "lax" });
  else if (cookie && !saved) res.cookies.delete(PROJECT_COOKIE);
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
