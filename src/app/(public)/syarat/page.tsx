import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Syarat & Ketentuan — Signalbase", description: "Syarat dan ketentuan penggunaan layanan Signalbase." };

const SECTIONS: LegalSection[] = [
  { id: "layanan", title: "Tentang layanan", body: <p>Signalbase menyediakan akses ke bank data percakapan media sosial dan berita online yang bersifat publik, beserta analisis dan kategorisasi, melalui panel web dan API. Dengan mendaftar atau memakai layanan, Anda menyetujui syarat ini.</p> },
  { id: "akun", title: "Akun dan persetujuan", body: <ul>
    <li>Pendaftaran ditinjau oleh admin Signalbase dan dapat ditolak tanpa alasan.</li>
    <li>Anda bertanggung jawab menjaga kerahasiaan kata sandi dan seluruh aktivitas pada akun Anda.</li>
    <li>Data pendaftaran harus benar; akun yang dipakai atas nama pihak lain dapat dinonaktifkan.</li>
  </ul> },
  { id: "paket", title: "Trial, paket, dan pembayaran", body: <ul>
    <li>Akun baru mendapat trial selama 7 hari sejak disetujui, dengan batasan sesuai halaman Harga.</li>
    <li>Setelah trial atau periode paket berakhir, kunci API berhenti bekerja sampai paket diperpanjang; proyek, keyword, dan pengaturan tetap tersimpan.</li>
    <li>Harga, batas, dan fitur paket tercantum di halaman Harga dan dapat berubah; perubahan berlaku pada periode tagihan berikutnya.</li>
    <li>Harga belum termasuk PPN. Pembayaran yang sudah diterima tidak dapat dikembalikan, kecuali disepakati tertulis.</li>
  </ul> },
  { id: "api", title: "Kunci API dan batas pemakaian", body: <ul>
    <li>Kunci API bersifat rahasia. Simpan di server, bukan di aplikasi browser atau seluler.</li>
    <li>Pemakaian dibatasi per akun per hari sesuai paket. Permintaan yang melebihi batas ditolak sampai kuota diisi ulang.</li>
    <li>Signalbase dapat mencabut atau menjeda kunci yang dipakai berlebihan, bocor, atau melanggar syarat ini.</li>
  </ul> },
  { id: "penggunaan", title: "Penggunaan yang diperbolehkan", body: <>
    <p>Anda boleh memakai data untuk pemantauan isu, riset, pelaporan, dan aplikasi internal maupun layanan Anda sendiri. Anda <strong>tidak boleh</strong>:</p>
    <ul>
      <li>memakai data untuk melecehkan, mengintimidasi, membuat profil, atau mendiskriminasi individu;</li>
      <li>menjual kembali atau membagikan data mentah dalam jumlah besar kepada pihak lain sebagai produk tersendiri;</li>
      <li>mencoba mengakses data di luar cakupan proyek, mengganggu sistem, atau menghindari batas pemakaian;</li>
      <li>melanggar hukum yang berlaku, termasuk ketentuan pelindungan data pribadi.</li>
    </ul>
  </> },
  { id: "data", title: "Data sumber dan hasil AI", body: <ul>
    <li>Data berasal dari sumber publik dan disediakan sebagaimana adanya. Ketersediaan, kelengkapan, dan ketepatan waktunya dapat berbeda per sumber.</li>
    <li>Analisis dan kategorisasi AI adalah perkiraan otomatis yang dapat keliru. Tinjau hasilnya sebelum dipakai untuk keputusan penting.</li>
    <li>Data pembuat post termasuk data pribadi. Anda wajib memperlakukannya sesuai peraturan pelindungan data pribadi yang berlaku bagi Anda.</li>
  </ul> },
  { id: "tanggung-jawab", title: "Batas tanggung jawab", body: <p>Layanan diberikan sebagaimana adanya. Sejauh diizinkan hukum, Signalbase tidak bertanggung jawab atas kerugian tidak langsung akibat pemakaian data atau gangguan layanan. Tanggung jawab total Signalbase terbatas pada biaya yang Anda bayarkan dalam tiga bulan terakhir. Ketentuan SLA khusus berlaku bila tercantum dalam perjanjian paket Instansi.</p> },
  { id: "penghentian", title: "Penghentian", body: <p>Anda dapat berhenti kapan saja. Signalbase dapat menonaktifkan akun yang melanggar syarat ini. Setelah akun dihentikan, akses ke panel dan API berakhir; data akun dihapus sesuai Kebijakan Privasi.</p> },
  { id: "perubahan", title: "Perubahan dan hukum yang berlaku", body: <p>Syarat ini dapat diperbarui; versi terbaru selalu tersedia di halaman ini dengan tanggal berlakunya. Syarat ini tunduk pada hukum Republik Indonesia.</p> },
];

export default function Page() {
  return <LegalPage label="SYARAT & KETENTUAN" title="Aturan main" accent="memakai Signalbase." lead="Ketentuan penggunaan panel dan API Signalbase, termasuk akun, paket, batas pemakaian, dan penggunaan data." updated="8 November 2026" sections={SECTIONS} />;
}
