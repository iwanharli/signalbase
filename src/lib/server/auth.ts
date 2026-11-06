import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE, verifySession } from "../session";

export async function getSession() {
  return verifySession((await cookies()).get(COOKIE)?.value);
}

// Wraps admin route handlers; middleware already guards, this is defence in depth.
export function adminRoute<C>(handler: (req: Request, ctx: C, user: string) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return handler(req, ctx, session.username);
  };
}
