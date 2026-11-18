// Background worker for local media analysis (see src/lib/server/media/worker.ts). Runs as its own process
// (PM2 `signalbase-media`) beside the Python service (PM2 `signalbase-media-ai`):
//   npm run media
import { mediaHousekeeping, runMediaTick } from "../src/lib/server/media/worker";

const INTERVAL_MS = 5 * 60_000;
/** While images are still waiting, the next tick starts right away instead of after the interval. */
const BUSY_PAUSE_MS = 5_000;
let stopping = false;

async function loop() {
  console.log("[media] started");
  while (!stopping) {
    const started = Date.now();
    let analyzed = 0;
    try {
      const removed = await mediaHousekeeping();
      if (removed && (removed.links || removed.assets)) console.log(`[media] dibersihkan: ${removed.links} tautan, ${removed.assets} gambar lama`);
      const r = await runMediaTick();
      analyzed = r.analyzed + r.backfilled;
      const total = Object.values(r.collected).reduce((a, b) => a + b, 0);
      if (total || analyzed) console.log(`[media] terkumpul ${JSON.stringify(r.collected)}, proyek dicek ${r.backfilled}, dianalisis ${r.analyzed} dalam ${Math.round((Date.now() - started) / 1000)} dtk`);
    } catch (e) {
      console.error("[media] tick gagal:", e);
    }
    await new Promise((r) => setTimeout(r, analyzed ? BUSY_PAUSE_MS : INTERVAL_MS));
  }
}

for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => { stopping = true; setTimeout(() => process.exit(0), 2_000); });
void loop();
