"use client";
// Small "i" button beside a Ringkasan card's title: a one-line summary of what the card shows and how to read it.
// The texts live here so every card explains itself the same way; keep them in step with the rules in Insights.tsx
// and lib/server/insights.ts (thresholds, comparisons).
import { useState } from "react";
import { Popover } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import c from "./cardHelp.module.css";

type Help = { title: string; short: string; read: string[] };

export const CARD_HELP = {
  volume: {
    title: "Volume",
    short: "Jumlah post media sosial dan berita online yang masuk dalam periode yang dipilih (untuk proyek: yang cocok dengan keyword proyek).",
    read: [
      "Panah dan persen membandingkan dengan periode sebelumnya yang sama panjang (mis. 7 hari ini vs 7 hari sebelumnya).",
      "\"baru\" berarti periode sebelumnya terlalu sedikit (< 20) untuk dibandingkan.",
      "Garis kecil di bawah adalah jumlah per hari; bentuknya saja, bukan skala.",
      "Volume naik belum tentu buruk; lihat bersama porsi negatif.",
    ],
  },
  negShare: {
    title: "Porsi negatif",
    short: "Persentase item bernada negatif dari item yang sudah dianalisis AI, bukan dari seluruh volume.",
    read: [
      "Perubahan ditulis dalam poin persentase: 37% → 41% = naik 4 poin.",
      "Turun ditandai hijau (membaik), naik ditandai merah.",
      "Garis kecil adalah porsi negatif per hari.",
      "Bila \"Teranalisis AI\" rendah, angka ini berasal dari sampel kecil; baca dengan hati-hati.",
    ],
  },
  posShare: {
    title: "Porsi positif",
    short: "Persentase item bernada positif dari item yang sudah dianalisis AI.",
    read: [
      "Perubahan dalam poin persentase dibanding periode sebelumnya; naik ditandai hijau.",
      "Sisanya (100% − negatif − positif) adalah netral.",
      "Garis kecil adalah porsi positif per hari.",
    ],
  },
  netSentiment: {
    title: "Sentimen bersih",
    short: "Porsi positif dikurangi porsi negatif, dalam poin persentase, dari item yang sudah dianalisis AI.",
    read: [
      "Minus berarti lebih banyak nada negatif daripada positif; makin minus, makin buruk.",
      "Contoh: positif 10% dan negatif 40% = −30 poin.",
      "Panah membandingkan dengan periode sebelumnya; naik (membaik) ditandai hijau.",
      "Rincian di bawah angka adalah porsi negatif dan positifnya.",
    ],
  },
  intenseNeg: {
    title: "Post negatif intens",
    short: "Jumlah post media sosial bernada negatif dengan intensitas tertinggi (5 dari 5) dalam periode ini.",
    read: [
      "Ini sinyal risiko yang paling perlu ditindaklanjuti: kemarahan atau penolakan yang kuat, bukan kritik ringan.",
      "Panah membandingkan dengan periode sebelumnya; naik ditandai merah.",
      "Klik untuk membuka post-post itu di halaman Media Sosial.",
    ],
  },
  negArticles: {
    title: "Berita negatif",
    short: "Jumlah berita online bernada negatif dalam periode ini.",
    read: ["Panah membandingkan dengan periode sebelumnya; naik ditandai merah.", "Garis kecil adalah jumlah per hari."],
  },
  interactions: {
    title: "Interaksi",
    short: "Total like, komentar, dan share pada post media sosial dalam periode ini, di semua platform.",
    read: [
      "Menunjukkan seberapa jauh percakapan menyebar, bukan hanya berapa banyak post.",
      "Angka dicatat saat post diambil, jadi menggambarkan interaksi awal, bukan total akhir.",
      "Rincian per platform ada di tabel Engagement per platform di bawah.",
    ],
  },
  outletCount: {
    title: "Media yang memberitakan",
    short: "Jumlah portal berita yang memuat berita sesuai cakupan dalam periode ini.",
    read: ["Makin banyak media, makin luas pemberitaan isu ini.", "Media yang tercatat dengan dua kode tetapi bernama sama dihitung satu."],
  },
  analysed: {
    title: "Teranalisis AI",
    short: "Bagian volume yang sudah diberi sentimen oleh AI. Semua angka porsi, tren opini, dan peringatan dihitung dari bagian ini.",
    read: [
      "Makin tinggi, makin mewakili angka porsi negatif/positif.",
      "Item terbaru biasanya belum dianalisis, jadi persentase hari ini bisa lebih rendah lalu naik sendiri.",
      "Garis kecil adalah persentase yang teranalisis per hari.",
    ],
  },
  aiSummary: {
    title: "Ringkasan AI",
    short: "Rangkuman satu hari penuh (kemarin) yang ditulis AI setiap pagi dari data bank atau proyek ini.",
    read: [
      "Judul besar adalah inti hari itu; di bawahnya ringkasan angka media sosial dan online.",
      "Tiap sorotan bertanda dampak (tinggi/sedang), arah (Baru/Naik) dan nada (Waspada/Negatif/Positif).",
      "\"Perlu diwaspadai\" berisi hal yang perlu dipantau berikutnya beserta pemicunya.",
      "Panah kiri/kanan membuka ringkasan hari lain. Periksa sumber sebelum dijadikan dasar keputusan.",
    ],
  },
  earlyWarning: {
    title: "Peringatan dini",
    short: "Membandingkan 24 jam terakhir dengan rata-rata harian 7 hari sebelumnya untuk menangkap perubahan mendadak.",
    read: [
      "Warna: abu-abu = Normal, kuning = Naik (perlu dipantau), oranye = Waspada (melewati ambang).",
      "Intensitas sangat tinggi: post negatif level 5. Naik bila ≥ 1,2× biasanya, Waspada bila ≥ 1,5× dan minimal 10 post.",
      "Porsi negatif: Naik bila ≥ 2 poin di atas rata-rata, Waspada bila ≥ 8 poin (minimal 30 item teranalisis).",
      "Lonjakan: topik atau keyword yang ≥ 2× biasanya (minimal 10); chip di bawah menunjukkan jumlah dan kelipatannya.",
      "Klik kartu atau chip untuk membuka post-postnya.",
    ],
  },
  trend: {
    title: "Tren opini",
    short: "Komposisi negatif, netral, dan positif per hari dari item yang sudah dianalisis AI.",
    read: [
      "Setiap batang = 100% item hari itu: merah negatif, abu-abu netral, hijau positif.",
      "Garis putus-putus adalah rata-rata porsi negatif periode ini; batang merah di atas garis = hari yang lebih negatif dari biasanya.",
      "Arahkan kursor ke batang untuk melihat jumlah dan persennya.",
      "Batang tidak menunjukkan volume; hari sepi dan hari ramai sama tinggi.",
    ],
  },
  topics: {
    title: "Topik teratas",
    short: "Kategori topik (hasil AI) dengan item terbanyak dalam periode ini.",
    read: [
      "Panjang garis relatif terhadap topik teratas.",
      "Persen di kanan membandingkan dengan periode sebelumnya yang sama panjang.",
      "Klik topik untuk membuka post-postnya.",
    ],
  },
  engagement: {
    title: "Engagement per platform",
    short: "Like, komentar, share, dan penayangan post media sosial per platform.",
    read: [
      "Interaksi per post = (like + komentar + share) ÷ jumlah post; cara adil membandingkan platform yang ukurannya berbeda jauh.",
      "Angka dicatat saat post diambil, jadi menggambarkan engagement awal, bukan total akhir.",
      "\"—\" berarti platform itu tidak mencatat metrik tersebut.",
      "Persen di baris Total membandingkan dengan periode sebelumnya.",
    ],
  },
  accounts: {
    title: "10 akun teratas",
    short: "Akun media sosial yang paling banyak mengunggah dalam periode ini.",
    read: [
      "Ikon di kanan atas memilih platform; semua sudah dimuat, jadi berganti instan.",
      "Angka = jumlah post; persen kecil = perubahan dari periode sebelumnya.",
      "Label \"% negatif\" = porsi post akun itu yang bernada negatif (dari yang sudah dianalisis AI).",
      "Klik akun untuk membuka profilnya.",
    ],
  },
  outlets: {
    title: "10 media teratas",
    short: "Media online dengan berita terbanyak dalam periode ini.",
    read: [
      "Angka = jumlah berita; persen kecil = perubahan dari periode sebelumnya.",
      "Label \"% negatif\" = porsi berita media itu yang bernada negatif.",
      "Klik media untuk membuka berita-beritanya.",
    ],
  },
  projectKeywords: {
    title: "Keyword per proyek",
    short: "Penyebutan tiap keyword proyek dan porsi negatifnya dalam periode ini.",
    read: [
      "Proyek yang sedang dilihat terbuka; proyek lain dimuat saat dibuka.",
      "Angka di baris proyek = total item; persen negatif dari item yang sudah dianalisis AI.",
      "Klik keyword untuk mencari post yang menyebutnya.",
    ],
  },
  hashtags: {
    title: "Tagar teratas",
    short: "Tagar yang paling sering muncul di sekitar 4.000 post media sosial terbaru.",
    read: [
      "Berasal dari sampel terbaru, jadi menggambarkan percakapan saat ini, bukan seluruh periode.",
      "Panjang garis relatif antartagar; tidak ada perbandingan periode.",
      "Klik tagar untuk mencarinya di Media Sosial.",
    ],
  },
  latestSocial: {
    title: "Sinyal terbaru media sosial",
    short: "Post media sosial paling baru yang masuk ke bank (atau yang menyebut keyword proyek).",
    read: [
      "Urut dari yang paling baru; waktu menunjukkan kapan post diunggah.",
      "Warna emosi di akhir baris berasal dari analisis AI (bila sudah dianalisis).",
      "\"Lihat semua\" membuka halaman Media Sosial.",
    ],
  },
  latestOnline: {
    title: "Sinyal terbaru media online",
    short: "Berita online paling baru yang masuk ke bank (atau yang menyebut keyword proyek).",
    read: [
      "Urut dari yang paling baru; waktu menunjukkan kapan berita terbit.",
      "Warna emosi di akhir baris berasal dari analisis AI (bila sudah dianalisis).",
      "\"Lihat semua\" membuka halaman Media Online.",
    ],
  },
} satisfies Record<string, Help>;

export type CardHelpId = keyof typeof CARD_HELP;

export function CardHelp({ id }: { id: CardHelpId }) {
  const h: Help = CARD_HELP[id];
  // Some cards are links: keep clicks on the button and in the (portalled) dropdown from following them.
  // Controlled, because an uncontrolled Popover.Target replaces the button's onClick.
  const [open, setOpen] = useState(false);
  const toggle = (e: React.SyntheticEvent) => { e.stopPropagation(); e.preventDefault(); setOpen((o) => !o); };
  return (
    <Popover opened={open} onChange={setOpen} width={320} position="bottom-start" withArrow shadow="lg" radius="md">
      <Popover.Target>
        <button type="button" className={c.button} onClick={toggle} aria-label={`Cara membaca: ${h.title}`} title="Cara membaca">
          <IconInfoCircle size={15} stroke={1.8} />
        </button>
      </Popover.Target>
      <Popover.Dropdown className={c.dropdown} onClick={(e) => e.stopPropagation()}>
        <b className={c.title}>{h.title}</b>
        <p className={c.short}>{h.short}</p>
        <span className={c.heading}>Cara membaca</span>
        <ul className={c.list}>{h.read.map((r) => <li key={r}>{r}</li>)}</ul>
      </Popover.Dropdown>
    </Popover>
  );
}
