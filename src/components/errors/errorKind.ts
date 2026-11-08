// Classifies a runtime error so the error page can say what actually happened.

export type ErrorKind = "notFound" | "server" | "update" | "offline";

/** Script chunks of the previous build vanish when a new version is deployed; the page only needs a reload. */
const CHUNK_ERROR = /ChunkLoadError|Loading (CSS )?chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

export const isChunkError = (error: unknown) =>
  error instanceof Error ? CHUNK_ERROR.test(`${error.name} ${error.message}`) : typeof error === "string" && CHUNK_ERROR.test(error);

export function errorKind(error: unknown): ErrorKind {
  if (isChunkError(error)) return "update";
  if (typeof navigator !== "undefined" && !navigator.onLine) return "offline";
  return "server";
}

const RELOAD_KEY = "sb-chunk-reload";
/** One automatic reload per 30 seconds at most, so a broken deploy can't loop the page forever. */
const RELOAD_WINDOW_MS = 30_000;

/** Reloads once to pick up the new build. Returns false when it already tried recently. */
export function reloadForUpdate(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < RELOAD_WINDOW_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch { /* storage blocked: still reload once */ }
  window.location.reload();
  return true;
}
