// Node.js side of instrumentation.ts: start the background overview warmer when a source database is configured.
// Only in production (or with WARM_CACHES=1): a developer's `npm run dev` reads the same source database, and its warm-ups
// were adding heavy Ringkasan scans to the production load.
import { warmOverview } from "./lib/server/overview";

if (process.env.SOURCE_DATABASE_URL && (process.env.NODE_ENV === "production" || process.env.WARM_CACHES === "1")) warmOverview();
