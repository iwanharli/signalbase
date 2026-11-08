// Made-up sample data for the landing-page panel preview. Nothing here comes from the real bank.
import { IconBrandInstagram, IconBrandThreads, IconBrandX } from "@tabler/icons-react";

/** [label, percent, colour] */
export type MoodShare = [string, number, string];

export const KEY_NAME = "Dashboard Humas";
export const KEYWORDS = ["pelayanan publik", "transportasi"];

// Home: 14 days of volume, oldest first; the last day is today (drawn hatched, still filling).
export const DAY_LABELS = ["26", "27", "28", "29", "30", "31", "1", "2", "3", "4", "5", "6", "7", "8"];
export const SOCIAL_DAYS = [42, 51, 47, 63, 58, 72, 66, 61, 78, 84, 70, 92, 88, 30];
export const ONLINE_DAYS = [18, 22, 20, 27, 25, 31, 29, 26, 33, 36, 30, 38, 35, 12];
export const SOCIAL_MOODS: MoodShare[] = [["Netral", 41, "#3b82f6"], ["Mendukung", 27, "#10b981"], ["Menolak", 14, "#f97316"], ["Marah", 11, "#ef4444"], ["Puas", 7, "#84cc16"]];
export const ONLINE_MOODS: MoodShare[] = [["Positif", 46, "#10b981"], ["Netral", 38, "#3b82f6"], ["Negatif", 16, "#ef4444"]];

export const LATEST = [
  { type: "social", text: "Lapor lewat aplikasi pengaduan, besoknya langsung ditindaklanjuti. Respons cepat begini bikin percaya.", meta: "X / Twitter · 2 menit lalu", mood: ["Mendukung", "#10b981"] },
  { type: "online", text: "Pemerintah daerah perluas layanan digital, warga bisa urus izin tanpa antre", meta: "Kabar Kota · 9 menit lalu", mood: ["Positif", "#10b981"] },
  { type: "social", text: "Halte baru nyaman, tapi jadwal busnya masih sering meleset dari aplikasi.", meta: "Threads · 14 menit lalu", mood: ["Netral", "#3b82f6"] },
  { type: "online", text: "Evaluasi transportasi publik: keluhan pengguna jadi dasar perbaikan rute", meta: "Warta Harian · 21 menit lalu", mood: ["Netral", "#3b82f6"] },
] as const;

export const HOME_KEYS = [
  { name: KEY_NAME, used: "Dipakai 2 menit lalu", keywords: KEYWORDS, active: true },
  { name: "Aplikasi Lalu Lintas", used: "Dipakai kemarin", keywords: ["lalu lintas", "tilang"], active: false },
];

// Media page: posts in display order; ones with `image` show a media block on top, so cards differ in height.
type Post = {
  icon: typeof IconBrandX; platform: string; author: string; handle: string; time: string; text: string;
  mood: [string, string]; topic: string; stats: [likes: number, comments: number, reposts: number]; image?: string;
};
export const POSTS: Post[] = [
  { icon: IconBrandX, platform: "X / Twitter", author: "Rina Kusuma", handle: "@rinakusuma", time: "2 mnt", text: "Lapor lewat aplikasi pengaduan, besoknya langsung ditindaklanjuti. Respons cepat begini bikin percaya. #pelayananpublik", mood: ["Mendukung", "#10b981"], topic: "Pelayanan publik", stats: [128, 24, 41] },
  { icon: IconBrandThreads, platform: "Threads", author: "Bima Pratama", handle: "@bimaprtm", time: "14 mnt", text: "Halte baru di dekat kantor nyaman, tapi jadwal busnya masih sering meleset dari aplikasi.", mood: ["Netral", "#3b82f6"], topic: "Transportasi", stats: [56, 12, 8] },
  { icon: IconBrandInstagram, platform: "Instagram", author: "Komunitas Hijau", handle: "@hijau.id", time: "32 mnt", image: "linear-gradient(135deg,#a7f3d0,#34d399 45%,#0e7490)", text: "Terima kasih petugas yang cepat merespons laporan lampu jalan mati di gang kami 🙏", mood: ["Puas", "#84cc16"], topic: "Pelayanan publik", stats: [842, 63, 120] },
  { icon: IconBrandX, platform: "X / Twitter", author: "Sari Wulandari", handle: "@sariwulan", time: "52 mnt", text: "Antrean di kantor layanan pagi ini jauh lebih tertib sejak ada nomor antrean online. Semoga konsisten.", mood: ["Mendukung", "#10b981"], topic: "Pelayanan publik", stats: [96, 17, 22] },
  { icon: IconBrandThreads, platform: "Threads", author: "Yoga Prasetyo", handle: "@yogaprst", time: "1 jam", image: "linear-gradient(135deg,#c7d2fe,#818cf8 50%,#4c1d95)", text: "Rute bus baru lewat kampus sangat membantu, tapi armadanya masih kurang di jam sibuk.", mood: ["Netral", "#3b82f6"], topic: "Transportasi", stats: [74, 19, 6] },
  { icon: IconBrandX, platform: "X / Twitter", author: "Dimas Ardi", handle: "@dimasardi", time: "41 mnt", text: "Sudah tiga hari laporan jalan berlubang belum ada tindak lanjut. Tolong dicek.", mood: ["Menolak", "#f97316"], topic: "Infrastruktur", stats: [210, 58, 33] },
];
export const MEDIA_FILTERS = ["7 hari", "Semua platform", "Semua emosi"];

// Keys page: rows of the key table. `ai` is [running, items processed] or null when off.
export const KEY_ROWS: { name: string; prefix: string; keywords: string[]; scope: string; ai: [boolean, string] | null; by: string; used: string; live: boolean }[] = [
  { name: KEY_NAME, prefix: "sb_7Kq2", keywords: KEYWORDS, scope: "Jawa Timur", ai: [true, "1.862"], by: "rina", used: "2 menit lalu", live: true },
  { name: "Aplikasi Lalu Lintas", prefix: "sb_P41x", keywords: ["lalu lintas", "tilang", "parkir", "ganjil genap"], scope: "Hanya media sosial", ai: null, by: "rina", used: "kemarin", live: false },
  { name: "Riset Lingkungan", prefix: "sb_Lm8e", keywords: ["banjir", "sampah"], scope: "Tanpa batasan", ai: [false, "640"], by: "rina", used: "3 hari lalu", live: false },
];
