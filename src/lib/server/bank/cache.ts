// Small in-memory TTL cache for expensive bank queries. Stores the promise itself, so
// concurrent callers share one query; failed loads are evicted so the next call retries.
//
// With `staleWhileRevalidate`, an expired entry that already loaded is still returned at once while one
// background load replaces it, so a slow query never makes a visitor wait after the first time.

type Entry<T> = { at: number; value: Promise<T>; ready: boolean; refreshing?: boolean };

export function createCache<T>({ ttlMs, maxEntries = 200, staleWhileRevalidate = false }: { ttlMs: number; maxEntries?: number; staleWhileRevalidate?: boolean }) {
  const entries = new Map<string, Entry<T>>();

  const start = (key: string, load: () => Promise<T>, previous?: Entry<T>) => {
    const value = load();
    const entry: Entry<T> = { at: Date.now(), value, ready: false };
    value.then(
      () => { entry.ready = true; if (previous) entries.set(key, entry); },
      () => {
        if (previous) previous.refreshing = false; // keep serving the old value, retry on a later call
        else if (entries.get(key) === entry) entries.delete(key);
      },
    );
    if (!previous) {
      entries.set(key, entry);
      if (entries.size > maxEntries) entries.delete(entries.keys().next().value!);
    }
    return value;
  };

  return (key: string, load: () => Promise<T>): Promise<T> => {
    const hit = entries.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value;
    if (hit && staleWhileRevalidate && hit.ready) {
      if (!hit.refreshing) { hit.refreshing = true; start(key, load, hit); }
      return hit.value;
    }
    return start(key, load);
  };
}

/** A cache shared by every bundle of the server process. Next.js loads instrumentation (the background warmer) and the
 *  route handlers as separate module copies, so a plain module-level cache filled by one is invisible to the other. */
export function sharedCache<T>(name: string, options: Parameters<typeof createCache<T>>[0]) {
  const registry = ((globalThis as unknown as { sbCaches?: Map<string, unknown> }).sbCaches ??= new Map());
  if (!registry.has(name)) registry.set(name, createCache<T>(options));
  return registry.get(name) as ReturnType<typeof createCache<T>>;
}
