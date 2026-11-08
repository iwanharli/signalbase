// Node.js side of instrumentation.ts: start the background overview warmer when a source database is configured.
import { warmOverview } from "./lib/server/overview";

if (process.env.SOURCE_DATABASE_URL) warmOverview();
