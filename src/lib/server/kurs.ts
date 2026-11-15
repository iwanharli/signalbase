// Kurs 1 USD dalam Rupiah dari open.er-api.com (ExchangeRate-API, gratis tanpa key, diperbarui harian), untuk biaya AI.
// Disimpan 6 jam per proses; gagal = kurs terakhir yang berhasil, atau null (pemanggil memakai kurs dari pengaturan).
const TTL = 6 * 3_600_000;
let memo: { at: number; kurs: number } | null = null;

export async function liveKurs(): Promise<number | null> {
  if (memo && Date.now() - memo.at < TTL) return memo.kurs;
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { cache: "no-store", signal: AbortSignal.timeout(5_000) });
    const kurs = res.ok ? ((await res.json()) as { rates?: { IDR?: unknown } }).rates?.IDR : null;
    // Nilai di luar rentang wajar dianggap balasan rusak.
    if (typeof kurs !== "number" || kurs < 1_000 || kurs > 100_000) return memo?.kurs ?? null;
    memo = { at: Date.now(), kurs: Math.round(kurs) };
    return memo.kurs;
  } catch {
    return memo?.kurs ?? null;
  }
}
