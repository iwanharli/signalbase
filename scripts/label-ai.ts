// Background worker for AI labelling. Its own process (PM2 `signalbase-label-ai`), separate from the categorisation
// worker. Run exactly one per database, or the same posts are sent (and paid for) twice:
//   npm run label-ai
import { log, runLabelAi } from "../src/lib/server/ai/labelWorker";

const INTERVAL_MS = 60_000;

async function loop() {
  log(`worker berjalan, memeriksa tiap ${INTERVAL_MS / 1000} detik. Ctrl+C untuk berhenti. Jalankan satu worker saja per database.`);
  for (;;) {
    const started = Date.now();
    try {
      await runLabelAi();
    } catch (error) {
      log(`putaran gagal, dicoba lagi: ${error instanceof Error ? error.message : String(error)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, Math.max(5_000, INTERVAL_MS - (Date.now() - started))));
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { log("worker dihentikan"); process.exit(0); });
loop();
