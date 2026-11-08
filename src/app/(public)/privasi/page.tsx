import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Kebijakan Privasi — Signalbase", description: "Bagaimana Signalbase mengumpulkan, memakai, dan melindungi data." };

const SECTIONS: LegalSection[] = [
  { id: "cakupan", title: "Cakupan", body: <p>Kebijakan ini menjelaskan data yang diproses Signalbase: data akun pelanggan, data pemakaian layanan, dan data publik media sosial serta berita yang menjadi isi bank data. Kebijakan ini disusun dengan memperhatikan Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi.</p> },
  { id: "akun", title: "Data akun pelanggan", body: <ul>
    <li><strong>Yang kami simpan:</strong> nama, username, kata sandi (dalam bentuk hash, tidak dapat dibaca), paket, dan waktu pendaftaran.</li>
    <li><strong>Dari formulir kontak:</strong> nama, instansi, email, nomor WhatsApp (opsional), dan pesan Anda.</li>
    <li><strong>Untuk apa:</strong> mengelola akun, memberi akses, menagih paket, dan menghubungi Anda terkait layanan.</li>
  </ul> },
  { id: "pemakaian", title: "Data pemakaian", body: <ul>
    <li>Jumlah panggilan API per proyek per hari dan waktu terakhir kunci API dipakai, untuk batas paket dan laporan pemakaian.</li>
    <li>Cookie sesi yang diperlukan agar Anda tetap masuk ke panel. Kami tidak memakai cookie iklan atau pelacak pihak ketiga.</li>
  </ul> },
  { id: "publik", title: "Data publik media sosial dan berita", body: <>
    <p>Bank data berisi konten yang dipublikasikan secara terbuka, termasuk nama, username, dan jumlah pengikut pembuat post. Data ini diproses untuk analisis percakapan publik.</p>
    <ul>
      <li>Kami tidak mengumpulkan pesan pribadi atau konten dari akun yang dikunci.</li>
      <li>Pelanggan yang menerima data ini lewat panel atau API wajib memperlakukannya sesuai hukum pelindungan data yang berlaku.</li>
      <li>Pemilik akun yang kontennya tercantum dapat meminta penghapusan melalui halaman kontak.</li>
    </ul>
  </> },
  { id: "ai", title: "Pemrosesan dengan AI", body: <p>Untuk kategorisasi AI, isi konten dikirim ke penyedia AI (misalnya Anthropic, OpenAI, atau DeepSeek) — penyedia milik Signalbase, atau penyedia dengan API key milik Anda sendiri. API key penyedia AI Anda disimpan terenkripsi dan hanya dipakai untuk kunci Anda.</p> },
  { id: "berbagi", title: "Pembagian data", body: <p>Kami tidak menjual data akun Anda. Data hanya dibagikan kepada penyedia infrastruktur dan penyedia AI yang diperlukan untuk menjalankan layanan, atau bila diwajibkan oleh hukum.</p> },
  { id: "keamanan", title: "Keamanan dan penyimpanan", body: <ul>
    <li>Koneksi terenkripsi (HTTPS); kunci API diperiksa dengan hash dan nilainya disimpan terenkripsi.</li>
    <li>Data akun disimpan selama akun aktif dan dihapus paling lambat 90 hari setelah akun ditutup, kecuali wajib disimpan lebih lama oleh hukum (misalnya catatan tagihan).</li>
  </ul> },
  { id: "hak", title: "Hak Anda", body: <p>Anda berhak meminta akses, perbaikan, atau penghapusan data pribadi Anda, serta menarik persetujuan. Ajukan melalui halaman kontak; kami menanggapi paling lambat 3 × 24 jam hari kerja.</p> },
  { id: "perubahan", title: "Perubahan kebijakan", body: <p>Kebijakan ini dapat diperbarui. Perubahan penting akan diberitahukan melalui panel atau email.</p> },
];

export default function Page() {
  return <LegalPage label="KEBIJAKAN PRIVASI" title="Data Anda," accent="diperlakukan dengan hati-hati." lead="Data apa yang kami proses, untuk apa, dan bagaimana Anda mengendalikannya." updated="8 November 2026" sections={SECTIONS} />;
}
