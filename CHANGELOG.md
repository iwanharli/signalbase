# Changelog

Semua perubahan penting pada Signalbase dicatat di sini. Format mengikuti [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/); belum memakai nomor versi, jadi dikelompokkan per tanggal. Terbaru di atas.

## [Belum dirilis]

### Ditambahkan
- Command Center bergaya "pusat komando": latar bola dunia **Mapbox** yang berfokus ke Indonesia (bergoyang pelan, tanpa label atau titik data), kartu kaca gelap yang memenuhi layar, logo Signalbase di header, kartu baru **Tren sentimen harian**, **Top akun sosial**, dan **Top media online**. Perlu `MAPBOX_TOKEN` (token publik `pk.`, dibaca di server lalu diberikan ke halaman); tanpa token atau tanpa WebGL latar tetap gelap polos. Bilah menu atas disembunyikan di halaman ini; tautannya berupa ikon di bilah kanan atas halaman lain, dan logo di header membawa kembali ke Ringkasan.
- Halaman **Command Center** (`/command-center`, di sebelah Ringkasan): rangkuman Ringkasan dalam satu layar tanpa scroll, berisi grafik sederhana yang semuanya memakai Chart.js lewat `react-chartjs-2`: donat emosi/sentimen, grafik area volume harian, tiga cincin perbandingan dengan periode sebelumnya (total, bernada negatif, bernada positif), batang kata kunci dan isu teratas, serta pita peringatan. Semua grafik mengikuti filter periode 7/14/30 hari (`GET /api/admin/stats` menerima `?days=`; tanpa itu tetap 14 hari volume dan 7 hari emosi untuk Ringkasan),  pilihan proyek, layar penuh, segar otomatis tiap 60 detik. Di layar kecil tampil bertumpuk dan bisa di-scroll. Memakai API Ringkasan dan Isu yang sudah ada; aturan akses sama.
- Halaman **Isu** (`/isu`) di sebelah kanan Media Online dengan submenu **Isu Nasional** dan **Isu Polisi** (`?topik=polisi`): isu berita dari `news_issues`, periode 3 hari, 7 hari (bawaan), 14 hari, dan 1 bulan, daftar peringkat berskor (maksimal 200), dan berita terkait per isu (kartu bergambar per hari, saring per sumber, navigasi antar isu, pintasan keyboard).
- Isu Polisi hanya memuat isu berjudul `polisi`, `polri`, atau `polda` (hardcode di `ISSUE_TOPICS`).
- Isu spam dilewati lewat `SPAM_TERMS`: zodiak, zodiac, iklan, harga emas, emas antam.
- API panel `GET /api/admin/issues` dan `GET /api/admin/issues/[id]`; akun user dibatasi kata kunci proyek yang dipilih (judul `ILIKE`) dan paketnya, isu di luar cakupan dijawab 404.
- `npm test` (tes `node:test` lewat `tsx`) dan `tests/issues.test.ts`.
- `npm run db:seed:projects`: seeder proyek contoh "Polisi" (kata kunci `polisi`, tanpa kategorisasi AI).
- `CHANGELOG.md`.

### Diubah
- `resolveScope` dipindah dari rute media ke `src/lib/server/panelScope.ts` agar dipakai bersama halaman Isu.
- `NoKeyYet` menerima label opsional.
- README: fitur Isu, perintah npm baru, struktur kode, dan keterangan batas paket yang sudah ditegakkan.

### Catatan
- `news_issues.news_count` tidak sinkron dengan isi `news_issue_items`; jumlah berita dihitung dari tabel item.

## 2026-11-09
- Pool koneksi bank data dipisah (utama dan analitik); kartu 10 akun teratas punya tab per platform.
- Proyek: pengaturan disimpan lewat tombol Simpan dengan modal konfirmasi dampak ke kategorisasi AI; toggle "hanya sudah dianalisis" dan "hanya sudah dikategorisasi"; label AI yang sudah ada tidak diulang atau dipotong dari kuota.
- Kategorisasi AI: backfill hingga 20 batch per putaran dan dibuka lagi bila tanggal mulai lebih awal.
- Deploy tanpa jeda (slot `.next-a`/`.next-b`, kembali otomatis bila gagal), `scripts/prod.sh`, dan `CLAUDE.md`.

## 2026-11-08
- Paket per akun dan batasnya, Signalbase AI, tagihan manual dengan invoice cetak, kuota AI dan top-up, halaman kontak dan legal.
- Pendaftaran user perlu persetujuan admin, halaman Pengguna; "Kunci API" diganti nama menjadi "Proyek".
- Ringkasan: Analisis periode, papan peringatan dini, engagement per platform, 10 akun dan 10 media teratas; cache dan pemanas.
- Pembatasan IP dan domain per kunci dengan CORS.
- Situs publik multi halaman, `/pricing`, `/integrasi`, PDF product knowledge, halaman error bergaya Signalbase.

## 2026-11-07
- Kategorisasi AI per kunci (Claude, DeepSeek, kompatibel OpenAI): worker, penyedia cadangan, uji prompt, koreksi manual, penyisiran post terlambat, perkiraan biaya, saldo dan riwayat token.
- Parameter cakupan tetap per kunci, halaman buat dan detail kunci, tampilan post asli per platform.

## 2026-11-06
- Rilis awal: bank data langsung dari Bankkomen, penjelajah media, API berkunci, dokumentasi, `run.sh`, `deploy.sh`, rute berbahasa Inggris.
