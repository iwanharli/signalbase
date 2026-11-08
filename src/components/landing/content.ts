// Copy and lists for the public landing page. Edit text here; the section components only lay it out.
import {
  IconBrandFacebook, IconBrandInstagram, IconBrandThreads, IconBrandTiktok, IconBrandX, IconBrandYoutube,
  IconKey, IconLayersIntersect, IconPlugConnected, IconSearch, IconSparkles, IconWorldWww,
} from "@tabler/icons-react";

export const NAV_LINKS = [
  { href: "#platform", label: "Platform" },
  { href: "#fitur", label: "Fitur" },
  { href: "#cara-kerja", label: "Cara kerja" },
  { href: "#integrasi", label: "Integrasi" },
  { href: "#faq", label: "FAQ" },
] as const;

export const HERO_TRUST = ["Sosial & berita", "AI sesuai kebutuhan", "Siap diintegrasikan"] as const;

export const SOURCES = [
  { icon: IconBrandX, label: "X / Twitter" },
  { icon: IconBrandInstagram, label: "Instagram" },
  { icon: IconBrandThreads, label: "Threads" },
  { icon: IconBrandTiktok, label: "TikTok" },
  { icon: IconBrandYoutube, label: "YouTube" },
  { icon: IconBrandFacebook, label: "Facebook" },
  { icon: IconWorldWww, label: "Media online" },
] as const;

/** The first feature is wide and shows a small filter demo instead of the numbered footer. */
export const FEATURES = [
  { icon: IconSearch, tag: "EKSPLORASI MEDIA", title: "Lebih sedikit noise. Lebih banyak konteks.", text: "Temukan percakapan dan pemberitaan yang relevan melalui pencarian, filter platform, wilayah, bahasa, kategori, dan waktu." },
  { icon: IconSparkles, tag: "ANALISIS KONTEKSTUAL", title: "Baca makna di balik kata.", text: "Lihat emosi, sentimen, intensitas, ringkasan, dan relevansi dari hasil analisis yang tersedia." },
  { icon: IconLayersIntersect, tag: "AI YANG ADAPTIF", title: "Kategori Anda. Cara pandang Anda.", text: "Sesuaikan prompt dan kategori AI untuk kebutuhan setiap aplikasi, dengan kategori terpisah untuk sosial dan berita." },
  { icon: IconKey, tag: "AKSES TERKONTROL", title: "Satu bank data, beragam kebutuhan.", text: "Berikan setiap aplikasi kunci API dengan batas kata kunci, wilayah, jenis media, dan cakupan datanya sendiri." },
] as const;

export const AI_POINTS = [
  "Prompt dan kategori khusus per aplikasi",
  "Pilihan penyedia utama dan cadangan",
  "Tinjau dan koreksi hasil secara manual",
  "Pantau progres, token, dan pemakaian AI",
] as const;
export const AI_PROVIDERS = ["Claude", "DeepSeek", "OpenAI", "Compatible API"] as const;

export const STEPS = [
  { icon: IconSearch, title: "Temukan", text: "Telusuri media sosial dan berita. Saring berdasarkan kata kunci, waktu, sumber, wilayah, dan konteks." },
  { icon: IconSparkles, title: "Pahami", text: "Periksa analisis yang tersedia. Tambahkan kategori AI khusus dan tinjau hasil yang perlu perhatian." },
  { icon: IconPlugConnected, title: "Hubungkan", text: "Buat kunci dengan cakupan terkontrol. Ambil data, ringkasan, dan tren melalui API." },
] as const;

export const API_POINTS = ["Daftar konten & filter", "Ringkasan emosi / sentimen", "Klasifikasi & tren kategori", "Cakupan per kunci API"] as const;

export const USE_CASES = [
  { tab: "Reputasi & komunikasi", title: "Reputasi yang dipahami lebih utuh.", text: "Telusuri pemberitaan dan percakapan tentang organisasi, temukan emosi yang muncul, dan tinjau konteks sebelum menentukan respons.", tags: ["Komunikasi korporat", "Public relations", "Brand monitoring"] },
  { tab: "Kebijakan & layanan publik", title: "Suara masyarakat, dalam konteksnya.", text: "Kelompokkan isu pelayanan dan kebijakan berdasarkan kategori yang Anda tentukan. Periksa sebaran wilayah dan konten sumber untuk memperkaya evaluasi.", tags: ["Pelayanan publik", "Evaluasi program", "Analisis wilayah"] },
  { tab: "Produk & pengembangan", title: "Data media untuk produk Anda.", text: "Bangun dashboard tematik atau aplikasi analitik dengan respons JSON yang konsisten, cakupan data terkontrol, dan hasil kategorisasi khusus.", tags: ["Dashboard sektoral", "Aplikasi internal", "Integrasi API"] },
] as const;

export const FAQS = [
  ["Apa itu Signalbase?", "Signalbase adalah bank data media dengan panel eksplorasi dan API. Anda dapat menelusuri percakapan media sosial serta berita online, memeriksa analisis yang tersedia, lalu meneruskan data yang relevan ke aplikasi lain."],
  ["Apakah kategori AI bisa disesuaikan?", "Ya. Setiap kunci API dapat memiliki prompt, model, dan kategori sendiri. Kategori media sosial dan media online dapat disamakan atau dibedakan. Hasil berkeyakinan rendah dapat ditinjau, dan admin dapat mengoreksi kategori secara manual."],
  ["Bagaimana cara mengintegrasikannya?", "Admin membuat kunci API, menentukan cakupannya, lalu aplikasi mengambil respons JSON melalui endpoint media. API menyediakan daftar item, ringkasan, pilihan filter, dan tren kategori untuk kunci dengan kategorisasi AI."],
  ["Apakah semua konten langsung dianalisis?", "Tidak selalu. Ketersediaan analisis bergantung pada data sumber. Kategorisasi khusus berjalan di background, memprioritaskan data baru lalu memproses arsip dalam rentang yang dipilih. Item yang belum diproses dapat memiliki classification: null."],
  ["Apakah saya bisa memilih penyedia AI?", "Ya. Kategorisasi mendukung Claude, DeepSeek, OpenAI, dan endpoint kompatibel OpenAI. Setiap kunci menggunakan kredensial penyedianya sendiri dan dapat memiliki penyedia cadangan."],
  ["Bagaimana akses data dan biaya dikendalikan?", "Cakupan kunci diterapkan di server dan kunci dapat dirotasi atau dicabut. Panel menyediakan pemantauan token, serta saldo dan batas biaya untuk penyedia yang mendukung pemeriksaan saldo. Hasil AI tetap perlu ditinjau sesuai kebutuhan penggunaannya."],
] as const;
