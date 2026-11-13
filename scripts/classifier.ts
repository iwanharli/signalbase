// Background worker for AI categorisation, the daily Ringkasan AI and the daily executive reports. Runs as its own process
// (PM2 `signalbase-classifier`):
//   npm run classifier
import { runDailySummaries } from "../src/lib/server/ai/summary";
import { runScheduledReports } from "../src/lib/server/report";
import { runClassifiers } from "../src/lib/server/ai/worker";

const INTERVAL_MS = 60_000;
let stopping = false;
let summarizing = false;
let reporting = false;

/** Daily summaries run beside labelling (a run can take minutes), never two at once. */
function summaries() {
  if (summarizing) return;
  summarizing = true;
  runDailySummaries()
    .then((count) => { if (count) console.log(`[ai-summary] ${count} ringkasan ditulis`); })
    .catch((error) => console.error("[ai-summary] run failed:", error))
    .finally(() => { summarizing = false; });
}

/** Executive reports of finished periods (day, week, month), beside labelling; each takes a few source-database scans. */
function reports() {
  if (reporting) return;
  reporting = true;
  runScheduledReports()
    .then((count) => { if (count) console.log(`[laporan] ${count} laporan ditulis`); })
    .catch((error) => console.error("[laporan] run failed:", error))
    .finally(() => { reporting = false; });
}

async function loop() {
  console.log("[classifier] started");
  while (!stopping) {
    const started = Date.now();
    summaries();
    reports();
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
