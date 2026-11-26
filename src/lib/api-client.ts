// Browser-side fetch wrapper: redirects to login on 401, throws API errors.
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  let res = await fetch(url, init);
  // A proxy error page (502/503/504/524 without JSON) is usually passing: a deploy switching builds, or a slow first count
  // that the server keeps computing and caching. GETs are retried once after a short pause before anything is shown.
  if (res.status >= 502 && (init?.method ?? "GET") === "GET" && !res.headers.get("content-type")?.includes("json")) {
    await new Promise((r) => setTimeout(r, 2500));
    res = await fetch(url, init);
  }
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Sesi berakhir");
  }
  // A non-JSON body is a proxy error page (e.g. Cloudflare on a slow or failed request): explain it instead.
  const data = await res.json().catch(() => ({
    error: res.status >= 500
      ? "Data sedang disiapkan. Muat ulang sebentar lagi."
      : "Server tidak merespons dengan benar",
  }));
  if (!res.ok) throw new Error(data.error ?? "Terjadi kesalahan");
  return data;
}

export const post = (url: string, body: unknown, method = "POST") =>
  api(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
