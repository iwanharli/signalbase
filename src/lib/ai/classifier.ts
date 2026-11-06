// Shared (client + server) definitions for AI categorisation: providers, categories, presets.
import { z } from "zod";

export const PROVIDER_KINDS = ["anthropic", "openai_compatible"] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

/** Ready-made provider settings the admin can start from. */
export const PROVIDER_PRESETS = [
  { id: "claude", label: "Claude (Anthropic)", kind: "anthropic", baseUrl: "", model: "claude-opus-5-5" },
  { id: "deepseek", label: "DeepSeek", kind: "openai_compatible", baseUrl: "https://api.deepseek.com", model: "deepseek-chat" },
  { id: "openai", label: "OpenAI", kind: "openai_compatible", baseUrl: "https://api.openai.com/v1", model: "" },
  { id: "custom", label: "Lainnya (kompatibel OpenAI)", kind: "openai_compatible", baseUrl: "", model: "" },
] as const;

export const providerInputSchema = z.object({
  name: z.string().trim().min(2).max(60),
  kind: z.enum(PROVIDER_KINDS),
  baseUrl: z.string().trim().url().max(300).or(z.literal("")).default(""),
  model: z.string().trim().min(2).max(100),
  /** Required on create; on update, empty keeps the stored key. */
  apiKey: z.string().trim().max(400).default(""),
});
export type ProviderInput = z.infer<typeof providerInputSchema>;

/** Reserved category for items that fit none of the categories. */
export const NO_CATEGORY = "none";

export const categorySchema = z.object({
  code: z.string().trim().regex(/^[A-Za-z0-9_-]{1,20}$/, "Kode hanya huruf, angka, - atau _").refine((c) => c.toLowerCase() !== NO_CATEGORY, "Kode 'none' sudah dipakai"),
  label: z.string().trim().min(2).max(80),
  description: z.string().trim().max(600).default(""),
});
export type Category = z.infer<typeof categorySchema>;

export const classifierInputSchema = z.object({
  providerId: z.string().uuid(),
  enabled: z.boolean().default(true),
  prompt: z.string().trim().min(10).max(6000),
  categories: z.array(categorySchema).min(2).max(30)
    .refine((list) => new Set(list.map((c) => c.code.toUpperCase())).size === list.length, "Kode kategori harus unik"),
  dailyLimit: z.number().int().min(10).max(200_000).default(5000),
});
export type ClassifierInput = z.infer<typeof classifierInputSchema>;

/** The eight Quick Wins of the Kapolri 100-day "Polisi Bersama Masyarakat" programme. */
export const QUICK_WIN_PRESET: { prompt: string; categories: Category[] } = {
  prompt: [
    "Kamu mengklasifikasikan post media sosial dan berita online berbahasa Indonesia ke dalam salah satu dari delapan Quick Win program 100 hari Kapolri \"Polisi Bersama Masyarakat\".",
    "Pilih tepat satu kategori yang paling sesuai dengan pokok isi teks, bukan sekadar kata yang disebut. Bila teks tidak berkaitan dengan kepolisian atau tidak cocok dengan kategori mana pun, pilih \"none\".",
    "Contoh: keluhan pungli saat membuat SIM masuk QW6; laporan kasus judi online masuk QW3; patroli malam atau tawuran masuk QW1.",
  ].join("\n"),
  categories: [
    { code: "QW1", label: "Ruang Publik Aman", description: "Kehadiran polisi di ruang publik: pengaturan lalu lintas, patroli, kegiatan bersama warga di sekolah dan rumah ibadah, premanisme, kejahatan jalanan, tawuran, gangguan kamtibmas." },
    { code: "QW2", label: "Pemulihan Kawasan Narkoba", description: "Peredaran dan penindakan narkoba, jaringan bandar, kampung narkoba, rehabilitasi pengguna, penyuluhan bahaya narkoba." },
    { code: "QW3", label: "Bersih Judi Daring dan Penipuan Digital", description: "Judi online, penipuan daring, pemblokiran situs atau rekening, patroli siber, edukasi anti judi dan penipuan." },
    { code: "QW4", label: "110 Respons Cepat, SPKT Ramah Korban", description: "Panggilan darurat 110, kecepatan polisi datang ke TKP, pelayanan laporan di SPKT, layanan ramah perempuan dan anak." },
    { code: "QW5", label: "Perkara Terlacak dan SP2HP Pasti", description: "Perkembangan penanganan perkara, SP2HP, laporan yang mandek, gelar perkara, keadilan restoratif." },
    { code: "QW6", label: "Bersih ke Dalam", description: "Integritas anggota: pungli SIM, SKCK, dan tilang, calo, pelanggaran atau perilaku oknum polisi, Propam, pengaduan Dumas." },
    { code: "QW7", label: "Polres Kuat, Polsek Tangguh", description: "Bhabinkamtibmas di desa, ketersediaan personel, Polsek siaga 24 jam, rembuk warga dan penyelesaian perkara ringan di tingkat lokal." },
    { code: "QW8", label: "KUHP/KUHAP Siap dan Scientific Crime Investigation", description: "KUHP dan KUHAP baru, BBM ilegal, kejahatan ekonomi, TPPO, korupsi, penyelundupan, pencucian uang, olah TKP ilmiah, identifikasi korban." },
  ],
};
