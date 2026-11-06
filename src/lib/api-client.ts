// Browser-side fetch wrapper: redirects to login on 401, throws API errors.
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Sesi berakhir");
  }
  const data = await res.json().catch(() => ({ error: "Server tidak merespons dengan benar" }));
  if (!res.ok) throw new Error(data.error ?? "Terjadi kesalahan");
  return data;
}

export const post = (url: string, body: unknown, method = "POST") =>
  api(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
