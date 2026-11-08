// Runs once when the Next.js server starts. Warms the overview caches so Ringkasan / Beranda open instantly.
// The exact `process.env.NEXT_RUNTIME === "nodejs"` check lets the build drop the Node-only import (pg, Prisma)
// from the Edge bundle; any other shape of the condition makes the Edge build fail.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
