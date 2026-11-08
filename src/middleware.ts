import { NextRequest, NextResponse } from "next/server";
import { COOKIE, verifySession } from "@/lib/session";

// Guards the panel and its API. /api/v1 uses API keys instead (checked in the route).
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/" || pathname === "/login" || pathname === "/register" || pathname.startsWith("/api/auth/") || pathname.startsWith("/api/v1/")) return NextResponse.next();
  if (await verifySession(req.cookies.get(COOKIE)?.value)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.redirect(new URL("/login", publicOrigin(req)));
}

// Behind nginx req.url carries the internal host; rebuild the public origin from proxy headers.
function publicOrigin(req: NextRequest) {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() || req.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export const config = { matcher: ["/((?!_next/|favicon|logo|icon).*)"] };
