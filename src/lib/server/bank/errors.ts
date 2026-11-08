// Turns a failed source-database query into a JSON response the panel and API clients can show.
// 503 (not 502): the site sits behind Cloudflare, which may swap an origin 502/504 for its own HTML error page,
// leaving the panel with nothing but "Server tidak merespons dengan benar".
import { NextResponse } from "next/server";

/** Postgres "canceling statement due to statement timeout". */
const STATEMENT_TIMEOUT = "57014";

export function sourceErrorResponse(e: unknown, context: string) {
  const timedOut = (e as { code?: string }).code === STATEMENT_TIMEOUT;
  console.warn(`[bank] ${context}: ${timedOut ? "query timed out" : (e as Error).message}`);
  return NextResponse.json(
    {
      error: timedOut
        ? "Permintaan ke sumber data terlalu lama. Coba lagi, atau persempit rentang waktu dan filter."
        : "Sumber data sedang tidak bisa dihubungi. Coba lagi sebentar lagi.",
      timedOut,
    },
    { status: 503, headers: { "Retry-After": "5" } },
  );
}
