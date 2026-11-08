// Browser-side fetch wrapper: redirects to login on 401, throws API errors.
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Sesi berakhir");
  }
  // A non-JSON body is a proxy error page (e.g. Cloudflare on a slow or failed request): explain it instead.
  const data = await res.json().catch(() => ({
    error: res.status >= 500
      ? "Server sedang sibuk atau permintaan terlalu berat. Coba lagi, atau persempit rentang waktu dan filter."
      : "Server tidak merespons dengan benar",
  }));
  if (!res.ok) throw new Error(data.error ?? "Terjadi kesalahan");
  return data;
}

export const post = (url: string, body: unknown, method = "POST") =>
  api(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
