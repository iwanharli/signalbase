// The 8 Quick Win categories from a local IndoBERT (scripts/indobert/qw_service.py), before a paid AI provider is called.
// Only for the API keys listed in LOCAL_QW_KEYS (the KIPERMAS classifier); the model was trained on that key's own labels.
// Posts at or above LOCAL_QW_MIN confidence are stored straight away; the rest still go to the AI provider. A service that is
// down or slow sends everything to the AI provider as before (it never fails a batch).
//   LOCAL_QW_URL=http://127.0.0.1:3725  LOCAL_QW_KEYS=<apiKeyId>[:<threshold>][,<apiKeyId>[:<threshold>]]  LOCAL_QW_MIN=0.8
// A per-key threshold (e.g. `id-b:0.8`) overrides LOCAL_QW_MIN for that key only.
import type { MediaType } from "@/lib/media/types";

export type LocalLabel = { id: string; category: string; confidence: number };

const threshold = (v: string | undefined) => (v?.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined);
/** Key → its own threshold (undefined = LOCAL_QW_MIN). */
const keys = () => new Map((process.env.LOCAL_QW_KEYS ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  .map((s) => { const [id, min] = s.split(":"); return [id.trim(), threshold(min)] as const; }));
/** This key's confidence threshold; 0 = every post labelled by the local model (no DeepSeek). Empty/invalid = LOCAL_QW_MIN, then 0.8. */
export const localQwMin = (apiKeyId?: string) =>
  (apiKeyId ? keys().get(apiKeyId) : undefined) ?? threshold(process.env.LOCAL_QW_MIN) ?? 0.8;

export function usesLocalQw(apiKeyId: string) {
  return !!process.env.LOCAL_QW_URL && keys().has(apiKeyId);
}

/** Local labels per item; null when the service is unavailable. */
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
