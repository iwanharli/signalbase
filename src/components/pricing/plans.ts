// Plans shown on /pricing. Edit prices, limits and copy here; the page only lays them out.
// Note: these limits are what the plans promise. The panel does not enforce them yet; admins assign them by hand.

export type Billing = "monthly" | "yearly";

export type Plan = {
  id: string;
  name: string;
  tagline: string;
  /** Rupiah per month. */
  monthly: number;
  /** Price is a starting point ("Mulai dari"), quoted per customer. */
  startsFrom?: boolean;
  /** Shown as the highlighted plan. */
  featured?: boolean;
  cta: { label: string; href: string };
  highlights: string[];
};

/** No free plan: a time-limited trial with nearly all Pro features and a small quota, then a paid plan. */
export const TRIAL = {
  days: 7,
  cta: { label: "Mulai trial 7 hari", href: "/register?plan=trial" },
  includes: ["Fitur Pro: analisis isi & kategorisasi AI otomatis (500 post)", "Media sosial & online", "1 kunci API, 2 keyword", "Riwayat 30 hari", "5.000 panggilan API per akun / hari"],
};

/** Yearly billing: 12 months with this discount. */
export const YEARLY_DISCOUNT = 0.1;
export const YEARLY_DISCOUNT_LABEL = `Hemat ${Math.round(YEARLY_DISCOUNT * 100)}%`;
/** Price for a full year, rounded to the nearest Rp10.000. */
export const yearlyPrice = (monthly: number) => Math.round((monthly * 12 * (1 - YEARLY_DISCOUNT)) / 10_000) * 10_000;

export const PLANS: Plan[] = [
  {
    id: "starter", name: "Starter", tagline: "Untuk tim humas atau unit kecil yang memantau isu tertentu.", monthly: 1_490_000,
    cta: { label: "Pilih Starter", href: "/register?plan=starter" },
    highlights: ["2 kunci API", "3 keyword per kunci", "Media sosial & online", "Riwayat 30 hari", "Analisis emosi & sentimen", "10.000 panggilan API per akun / hari"],
  },
  {
    id: "pro", name: "Pro", tagline: "Untuk organisasi yang memantau banyak isu dan menghubungkannya ke aplikasi.", monthly: 3_490_000, featured: true,
    cta: { label: "Pilih Pro", href: "/register?plan=pro" },
    highlights: ["5 kunci API", "7 keyword per kunci", "Riwayat 1 tahun", "Analisis isi: ringkasan, sasaran & relevansi", "Kategorisasi AI otomatis hingga 20.000 post/bulan (tanpa perlu akun AI sendiri)", "Filter wilayah & kategori", "100.000 panggilan API per akun / hari"],
  },
  {
    id: "instansi", name: "Instansi", tagline: "Untuk pemerintah dan korporat dengan kebutuhan data dan pendampingan khusus.", monthly: 7_000_000, startsFrom: true,
    cta: { label: "Hubungi kami", href: "/kontak?plan=instansi" },
    highlights: ["Kunci API tanpa batas", "Seluruh arsip data", "Analisis terlengkap: skor, sinyal, faktor, topik & watchlist", "Kategorisasi AI otomatis dengan model enhancement", "Pendampingan & pelatihan tim", "SLA & dukungan prioritas"],
  },
];

/** Comparison table columns: the trial first, then the paid plans. */
export const COMPARISON_COLUMNS = ["Trial 7 hari", "Starter", "Pro", "Instansi"];

/** Comparison table: one row per feature, one value per column (true = included, false = not, string = the limit). */
export const COMPARISON: { group: string; rows: { label: string; note?: string; values: (string | boolean)[] }[] }[] = [
  {
    group: "Data", rows: [
      { label: "Media sosial", values: [true, true, true, true] },
      { label: "Media online", values: [true, true, true, true] },
      { label: "Riwayat data", values: ["30 hari", "30 hari", "1 tahun", "Seluruh arsip"] },
      { label: "Detail pembuat post", values: [true, true, true, true] },
    ],
  },
  {
    group: "Analisis bank data", rows: [
      { label: "Emosi (sosial) & sentimen (berita)", values: [true, true, true, true] },
      { label: "Intensitas emosi", values: [true, true, true, true] },
      { label: "Ringkasan isi & sasaran", values: [true, false, true, true] },
      { label: "Relevansi & filter yang tidak relevan", values: [true, false, true, true] },
      { label: "Skor, sinyal & faktor", values: [false, false, false, true] },
      { label: "Topik terdeteksi", values: [false, false, false, true] },
      { label: "Label \"perlu dipantau\" (watchlist)", values: [false, false, false, true] },
    ],
  },
  {
    group: "Kunci & API", rows: [
      { label: "Kunci API", values: ["1", "2", "5", "Tanpa batas"] },
      { label: "Keyword per kunci", values: ["2", "3", "7", "30"] },
      { label: "Panggilan API per akun / hari", note: "Dibagi untuk semua kunci; 1 panggilan = sampai 100 post", values: ["5.000", "10.000", "100.000", "Sesuai kebutuhan"] },
      { label: "Filter wilayah & kategori pada kunci", values: [true, false, true, true] },
    ],
  },
  {
    group: "AI & kategorisasi", rows: [
      { label: "Kategorisasi AI dengan kategori sendiri", values: [true, false, true, true] },
      { label: "Kategorisasi AI otomatis, tanpa perlu akun AI sendiri", values: [true, false, true, true] },
      { label: "Kuota kategorisasi AI", values: ["500 post", false, "20.000 post / bulan", "Sesuai kontrak"] },
      { label: "Model enhancement (lebih akurat)", values: [false, false, false, true] },
      { label: "Bawa kunci AI sendiri, tanpa batas kuota", values: [false, false, true, true] },
      { label: "Tinjau & koreksi hasil AI", values: [true, false, true, true] },
    ],
  },
  {
    group: "Dukungan", rows: [
      { label: "Kanal dukungan", values: ["Email", "Email", "Email prioritas", "Pendampingan & SLA"] },
    ],
  },
];

export const PRICING_FAQS = [
  ["Apakah ada paket gratis?", "Tidak ada paket gratis selamanya. Sebagai gantinya, setiap akun baru mendapat trial 7 hari dengan hampir semua fitur Pro, termasuk analisis isi (ringkasan, sasaran, relevansi) dan kategorisasi AI otomatis untuk 500 post, dengan kuota kecil: 1 kunci API, 2 keyword, dan riwayat 30 hari."],
  ["Apa yang terjadi setelah trial berakhir?", "Kunci API berhenti bekerja sampai Anda memilih paket. Kunci, keyword, dan pengaturan AI tetap tersimpan, jadi langsung aktif kembali setelah paket dipilih."],
  ["Apakah akun langsung aktif setelah daftar?", "Belum. Setiap pendaftaran ditinjau admin terlebih dahulu. Trial 7 hari dimulai saat akun disetujui."],
  ["Bagaimana cara membayar?", "Setelah akun disetujui, tim kami mengirim tagihan sesuai paket. Pembayaran tahunan mendapat potongan 10%."],
  ["Bisakah berganti paket?", "Bisa, kapan saja. Batas kunci, keyword, dan riwayat mengikuti paket baru mulai periode tagihan berikutnya."],
  ["Apa beda analisis bank data dan kategorisasi AI?", "Analisis bank data sudah tersedia di sumber untuk setiap post: emosi, sentimen, ringkasan, sasaran, dan relevansi, serta skor, sinyal, faktor, topik, dan label watchlist pada paket Instansi. Kategorisasi AI adalah pengelompokan tambahan dengan kategori yang Anda tentukan sendiri untuk setiap kunci."],
  ["Apa itu Signalbase AI?", "Model kategorisasi yang disediakan Signalbase. Anda cukup menentukan kategori; tidak perlu membuat akun atau memasukkan API key penyedia AI. Pemakaian dihitung per post atau berita yang dikategorikan, dan sudah termasuk dalam paket."],
  ["Apa itu model enhancement?", "Model dan instruksi yang disetel khusus untuk kebutuhan instansi, sehingga hasil kategorisasi lebih akurat dan konsisten. Tersedia di paket Instansi."],
  ["Bagaimana jika kuota Signalbase AI habis?", "Anda diberi peringatan saat kuota terpakai 80% dan saat habis. Setelah habis, kategorisasi dijeda sampai bulan berikutnya; data media tetap bisa diakses. Di paket Pro Anda bisa menambah 20.000 post untuk bulan berjalan (Rp500.000 + PPN) dari halaman Tagihan, atau memakai kunci AI sendiri tanpa batas kuota. Post yang ditandai tidak relevan oleh analisis bank data tidak memakai kuota."],
  ["Bagaimana batas panggilan API dihitung?", "Per akun, bukan per kunci: semua kunci API milik akun berbagi jatah harian yang sama. Satu panggilan mengambil sampai 100 post atau berita. Pemakaian per kunci terlihat di panel, sehingga Anda tahu aplikasi mana yang paling banyak memanggil."],
  ["Apakah data saya terpisah dari pengguna lain?", "Ya. Setiap kunci punya keyword dan cakupan sendiri, dan hanya pemiliknya yang bisa melihat atau mengubahnya."],
] as const;

/** Product-knowledge PDF built from this file by `npm run brochure` (scripts/brochure).
 *  The URL stays the same across editions so shared links keep working; the saved file name carries the edition. */
export const BROCHURE_URL = "/signalbase-product-knowledge.pdf";
export const BROCHURE_EDITION = "Nov 2026";
export const BROCHURE_FILENAME = `Signalbase - Product Knowledge (${BROCHURE_EDITION}).pdf`;

export const formatRupiah = (n: number) => `Rp${n.toLocaleString("id-ID")}`;
