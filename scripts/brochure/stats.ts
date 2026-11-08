// Real figures from the Signalbase bank, shown on the brochure cover. Taken from the panel (admin, whole bank) on AS_OF.
// Refresh before printing a new edition: Ringkasan for daily volumes, Media Sosial / Online "Total cocok" with
// "Semua waktu" for the archive and analysed totals, and the filter lists for sources and provinces.

export const AS_OF = "8 November 2026";

export const ARCHIVE = { social: 6_013_131, online: 1_670_122 };
export const ANALYSED = { social: 2_240_529, online: 1_147_892 };
export const ONLINE_OUTLETS = 2_280;
export const SOCIAL_PLATFORMS = 6;
export const PROVINCES = 38;

/** Items per finished day, oldest first (26 Oct – 7 Nov 2026). */
export const DAILY = {
  social: [30490, 30449, 38448, 29125, 32685, 27077, 21224, 32711, 40493, 38936, 34487, 30190, 22668],
  online: [13059, 15274, 15976, 15296, 14181, 10427, 8814, 15309, 15206, 14070, 15374, 13365, 9342],
};

/** Emotion (social) and sentiment (news) split over the last 7 days, whole bank, in percent. */
export const MOODS = {
  social: [["Menolak", 42, "#f97316"], ["Netral", 29, "#3b82f6"], ["Marah", 22, "#ef4444"], ["Mendukung", 6, "#10b981"]] as [string, number, string][],
  online: [["Positif", 41, "#10b981"], ["Netral", 35, "#3b82f6"], ["Negatif", 24, "#ef4444"]] as [string, number, string][],
};

const sum = (a: number[]) => a.reduce((t, n) => t + n, 0);
export const PER_DAY = Math.round((sum(DAILY.social) + sum(DAILY.online)) / DAILY.social.length);
export const ARCHIVE_TOTAL = ARCHIVE.social + ARCHIVE.online;
export const ANALYSED_TOTAL = ANALYSED.social + ANALYSED.online;

/** 7_683_253 → "7,6 juta" (rounded down, so "+" stays true). 45_123 → "45 ribu". */
export function compactId(n: number) {
  if (n >= 1_000_000) return `${(Math.floor(n / 100_000) / 10).toLocaleString("id-ID")} juta`;
  if (n >= 1_000) return `${Math.floor(n / 1_000).toLocaleString("id-ID")} ribu`;
  return n.toLocaleString("id-ID");
}
