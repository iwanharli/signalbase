// Runs once when the Next.js server starts. Warms the whole-bank overview so the admin's Ringkasan opens instantly.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.SOURCE_DATABASE_URL) return;
  const { warmOverview } = await import("./lib/server/overview");
  warmOverview();
}
