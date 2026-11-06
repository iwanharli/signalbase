// Small in-memory TTL cache for expensive bank queries. Stores the promise itself, so
// concurrent callers share one query; failed loads are evicted so the next call retries.

type Entry<T> = { at: number; value: Promise<T> };

export function createCache<T>({ ttlMs, maxEntries = 200 }: { ttlMs: number; maxEntries?: number }) {
  const entries = new Map<string, Entry<T>>();
  return (key: string, load: () => Promise<T>): Promise<T> => {
    const hit = entries.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value;
    const value = load();
    value.catch(() => { if (entries.get(key)?.value === value) entries.delete(key); });
    entries.set(key, { at: Date.now(), value });
    if (entries.size > maxEntries) entries.delete(entries.keys().next().value!);
    return value;
  };
}
