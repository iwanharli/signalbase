// Kategori 8 Quick Win dari IndoBERT lokal (scripts/indobert/layanan_qw.py), sebelum penyedia AI berbayar dipanggil.
// Hanya untuk API key yang disebut di LOCAL_QW_KEYS (classifier KIPERMAS); model dilatih dari label key itu sendiri.
// Post yang keyakinannya >= LOCAL_QW_MIN langsung disimpan; sisanya tetap ke penyedia AI. Layanan mati/lambat = semua ke
// penyedia AI seperti sebelumnya (tidak pernah menggagalkan batch).
//   LOCAL_QW_URL=http://127.0.0.1:3725  LOCAL_QW_KEYS=<apiKeyId>[:<ambang>][,<apiKeyId>[:<ambang>]]  LOCAL_QW_MIN=0.8
// Ambang per key (mis. `id-b:0.8`) menimpa LOCAL_QW_MIN untuk key itu saja.
import type { MediaType } from "@/lib/media/types";

export type LocalLabel = { id: string; category: string; confidence: number };

const threshold = (v: string | undefined) => (v?.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined);
/** Key → its own threshold (undefined = LOCAL_QW_MIN). */
const keys = () => new Map((process.env.LOCAL_QW_KEYS ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  .map((s) => { const [id, min] = s.split(":"); return [id.trim(), threshold(min)] as const; }));
/** Ambang keyakinan key ini; 0 = semua post dilabel model lokal (tanpa DeepSeek). Kosong/tidak valid = LOCAL_QW_MIN, lalu 0,8. */
export const localQwMin = (apiKeyId?: string) =>
  (apiKeyId ? keys().get(apiKeyId) : undefined) ?? threshold(process.env.LOCAL_QW_MIN) ?? 0.8;

export function usesLocalQw(apiKeyId: string) {
  return !!process.env.LOCAL_QW_URL && keys().has(apiKeyId);
}

/** Label lokal per item; null bila layanan tidak tersedia. */
export async function localQw(type: MediaType, items: { id: string; text: string }[]): Promise<{ model: string; items: LocalLabel[] } | null> {
  if (!items.length) return { model: "", items: [] };
  try {
    const res = await fetch(`${process.env.LOCAL_QW_URL}/qw`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, items }), signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as { model: string; items: LocalLabel[] };
  } catch (e) {
    console.warn(`[classifier] model lokal QW tidak tersedia, semua ke penyedia AI: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}
