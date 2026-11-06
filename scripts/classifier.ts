// Background worker for AI categorisation. Runs as its own process (PM2 `signalbase-classifier`):
//   npm run classifier
import { runClassifiers } from "../src/lib/server/ai/worker";

const INTERVAL_MS = 60_000;
let stopping = false;

async function loop() {
  console.log("[classifier] started");
  while (!stopping) {
    const started = Date.now();
    try {
      const count = await runClassifiers();
      if (count) console.log(`[classifier] tick: ${count} classifier(s), ${Math.round((Date.now() - started) / 1000)}s`);
    } catch (error) {
      console.error("[classifier] tick failed:", error);
    }
    await new Promise((resolve) => setTimeout(resolve, Math.max(5_000, INTERVAL_MS - (Date.now() - started))));
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { stopping = true; process.exit(0); });
loop();
