"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api-client";

// Loads an endpoint and refetches when `url` changes. Old data stays visible while reloading.
export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const latest = useRef(0);
  const reload = useCallback(() => {
    if (!url) return;
    const id = ++latest.current;
    setLoading(true);
    setError(null);
    return api<T>(url)
      .then((d) => { if (id === latest.current) setData(d); })
      .catch((e: Error) => { if (id === latest.current) setError(e.message); })
      .finally(() => { if (id === latest.current) setLoading(false); });
  }, [url]);
  useEffect(() => { void reload(); }, [reload]);
  return { data, error, loading, reload };
}
