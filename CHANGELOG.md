# Changelog

Semua perubahan penting pada Signalbase dicatat di sini. Format mengikuti [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/); belum memakai nomor versi, jadi dikelompokkan per tanggal. Terbaru di atas.

## Ringkasan per tanggal

| Tanggal | Yang ditambahkan |
|---|---|
| [2026-11-26](#2026-11-26) | Route `/project`, proyek media lewat `?key=`, filter media tersimpan dan URL bersih, tombol Reset filter |
| [2026-11-18](#2026-11-18) | Tema gelap, Ringkasan didesain ulang, pencarian OR dan jeda pencarian |
| [2026-11-17](#2026-11-17) | Filter Proyek / Isu di halaman media |
| [2026-11-16](#2026-11-16) | Biaya AI, API usage, model QW lokal |
| [2026-11-13](#2026-11-13) | Laporan eksekutif, Quick/Original View, tampilan post X |
| [2026-11-12](#2026-11-12) | Halaman Isu, Isu EWS, SNA, Ontologi, Command Center |
| [2026-11-09](#2026-11-09) | Slot deploy tanpa jeda, simpan Proyek dengan konfirmasi, backfill AI |
| [2026-11-08](#2026-11-08) | Paket dan tagihan, Signalbase AI, pembatasan IP/domain, situs publik |
| [2026-11-07](#2026-11-07) | Kategorisasi AI per kunci, cakupan kunci, tampilan post asli |
| [2026-11-06](#2026-11-06) | Rilis awal |

## 2026-11-26

### Diubah
- **Route Proyek**: `/api-keys` menjadi `/project` (`/project`, `/project/new`, `/project/[id]`, `/project/[id]/ai`). URL lama `/api-keys/...` dialihkan sementara (307) dengan query ikut; `/kunci-api` langsung ke `/project`. API (`/api/admin/keys`, `/api/v1`) dan nama kode tidak berubah.
- **Proyek / Isu** di filter lanjutan Media Sosial/Online kini memakai `?key=`: halaman dilihat sebagai proyek itu (seluruh cakupan, kecocokan teks gambar, label manual, kategori AI), bukan lagi penyaring kata kunci saja. Ganti proyek mengosongkan filter label dan kategori AI; akun klien tidak bisa mengosongkan pilihan; dropdown memuat proyek aktif yang mencakup jenis media itu; chip "Proyek: …" dihapus. Link lama `?project=` dialihkan ke `?key=` (bila keduanya ada, `key` dipakai). Irisan dua proyek tidak tersedia lagi; parameter internal `pkw` dihapus.
- **URL tanpa filter**: alamat Media Sosial/Online hanya `/media/<jenis>` (plus `?key=`). Link berisi filter atau `tampilan=` (Ringkasan, SNA, hasil AI, bookmark lama) tetap diterapkan, disimpan, lalu URL dibersihkan; filter dari link menimpa simpanan jenis media + proyek itu. Filter tidak bisa dibagikan lewat URL, Back tidak memundurkan filter, dan tab dengan jenis media + proyek sama berbagi satu simpanan.
- **Filter tersimpan** di `localStorage` per jenis media dan proyek; tetap setelah muat ulang atau lewat menu. Rentang 2/7/30 hari disimpan sebagai pilihan, bukan tanggal. Pilihan Quick/Original View juga hanya di `localStorage`. Reset mengembalikan bawaan (proyek tetap); logout lewat menu **Keluar** menghapus simpanan filter (sesi yang habis sendiri tidak).
- Tombol merah **Reset filter** baru di baris Filter aktif (nonaktif saat filter bawaan); tombol “Reset ke awal” tetap.
- API publik dan database tidak berubah.

## 2026-11-18

### Ditambahkan
- **Media visual** (Analisis → Media visual, admin saja selama uji coba): gambar berita online, foto/video X, dan thumbnail YouTube dianalisis **lokal di server** (tanpa AI cloud; gambar diunduh, dianalisis, lalu dibuang). Worker `npm run media` (PM2 `signalbase-media`) + layanan Python `scripts/media/layanan_media.py` (PM2 `signalbase-media-ai`): teks di gambar (RapidOCR, model Inggris), tag visual dan penanda konten sensitif (CLIP ONNX), sidik jari gambar untuk gambar yang beredar ulang/mirip. Halaman per post (kolase, teks dan tag gabungan) atau per gambar, masonry 4 kolom, filter sumber/proyek/tag/ada teks/perlu ditinjau/ajakan aksi/klaim angka, infinite scroll, modal dengan teks penting di kanan, galeri, gambar mirip, dan status worker di header.
- **Teks penting gambar**: teks OCR tanpa elemen tampilan aplikasi, stempel kamera, teks kecil, watermark media, dan pengulangan caption; dipakai kartu, filter, dan pencarian.
- **Teks gambar ikut kata kunci proyek**: post yang kata kuncinya hanya ada di gambar (caption kosong/emoji) ikut masuk proyek di Media Sosial/Online, Ringkasan, laporan, klasifikasi AI, Ringkasan AI, dan API publik; kartu ditandai "Kata kunci di gambar". Pencarian (`?q=`) juga menemukan teks di gambar.
- **Instagram tidak tersangkut saat halaman post dibatasi**: Instagram mengalihkan halaman post dari server ke login (rate limit, 21 Nov 2026) sementara embed resmi tetap terbuka. Gambar kini diambil dari markup embed (`EmbeddedMediaImage`) bila JSON-nya kosong; halaman post hanya cadangan dan diistirahatkan 1 jam setelah kena login; post dihapus/privat dilewati. Sebelumnya pengumpulan Instagram berhenti di post yang sama tiap putaran (279 post tertunda).
- **Analisis tidak menunggu pengumpulan** (worker Media visual): pengumpulan post (FxTwitter, satu halaman Instagram/Threads per detik: beberapa menit) kini berjalan bersamaan dengan analisis gambar dan transkripsi; keduanya terus jalan sampai pengumpulan selesai dan jatah waktunya habis. Sebelumnya layanan analisis menganggur ±6 dari ±9,5 menit per putaran (±1.500 gambar/jam, antrean tidak turun).
- **Media visual dibuka untuk klien**: menu Analisis → Media visual untuk semua peran; akun klien hanya melihat gambar proyeknya sendiri (seperti SNA), termasuk gambar mirip; status worker hanya untuk admin. API `media-visual` dan `media-visual/twins` mengikuti cakupan proyek (`&key=`).
- **Notifikasi media visual** (lonceng di header): ajakan aksi, narasi yang dipakai ≥3 post, dan gambar perlu ditinjau dari 24 jam terakhir; titik merah = baru sejak lonceng terakhir dibuka (disimpan di browser); klik membuka Media visual dengan filter itu. Admin/viewer: seluruh bank; klien: proyeknya. API `GET /api/admin/media-visual/alerts`.
- **Ucapan video ikut sinyal**: ajakan aksi dan klaim angka juga dibaca dari transkrip (per kalimat); proyek dicocokkan dengan teks gambar dan ucapan.
- **Frame video tidak dihitung sendiri**: statistik dan tampilan "Per gambar" tidak memuat frame video (X/Reels `#t=`, YouTube `hq1–hq3`); frame tetap ada di galeri post, teks, dan pencarian.
- **Transkripsi berjalan bersamaan dengan analisis gambar** (bukan sesudahnya), 3 menit per putaran (`MEDIA_ASR_BUDGET_MS`).
- **Analisis ulang otomatis setelah ganti model**: saat antrean < 2.000, worker mengantrekan ulang 2.000 gambar terbaru yang dianalisis model lain (mis. OCR v3 → v5), tanpa menahan gambar baru.
- **Model tag visual sesi label 2** (Media visual): +392 gambar produksi berlabel (lebih banyak dari tag yang sering tertukar), data latih 1.256; set uji tetap 286: tepat 66,8% → 68,9%, longgar 79,7% → 78,7%.
- **OCR PP-OCRv5** (Media visual): pembaca teks Inggris PP-OCRv5 menggantikan v3 (uji 40 gambar produksi: +14% baris, +17% kata, spasi terjaga; huruf bergaya yang dulu "tidak terbaca" kini terbaca). Gambar yang tetap tidak terbaca dibaca ulang dengan model Arab, Kirill, dan Mandarin; hasilnya dipakai bila sebagian besar hurufnya memang non-Latin (teks Arab dibalik ke urutan yang benar). Model `media-clip-b32-v3+rapidocr-en5-u`.
- **Teks tangkapan layar lebih bersih** (Media visual): status bar ponsel, tab/tombol aplikasi, lencana App Store/Google Play, label grafik saham, nama media/platform sendirian (KOMPAS, IDN TIMES, TikTok…) dan baris jumlah tayangan dibuang dari teks penting. Klaim angka tidak lagi menangkap tayangan/suka/subscriber, kecepatan dashcam, "3T" (wilayah), "Rp" di tengah kata, dan Rp 0. Uji 4.000 gambar produksi: 326 berubah, klaim 240 → 214 (semua yang dibuang memang bukan klaim). Teks lama diturunkan ulang (`TEXT_RULES_VERSION` 4).
- **Media visual: isi video, ucapan, carousel, dan gambar badan berita**:
  - Frame video: YouTube `hq1`–`hq3` (frame ±25/50/75% durasi) selain thumbnail; video X dan Reels Instagram 3 frame (25/50/75%, dibaca PyAV lewat HTTP tanpa mengunduh utuh). GIF X tetap hanya poster. Di halaman frame tampil sebagai video yang dihentikan di titiknya; diperbesar = videonya diputar dari situ.
  - Transkripsi suara video X dan Reels (faster-whisper `small` lokal, 3 menit pertama, layanan `signalbase-media-asr`): bagian "Ucapan di video" di modal, lencana "Ucapan", ikut filter "Ada teks", pencarian, pencocokan proyek, dan teks untuk AI.
  - Instagram: semua slide carousel (maks. 6) dan video Reels dari halaman embed resmi; tanpa data embed tetap `og:image`.
  - Berita: gambar di badan artikel (`news_content`, maks. 4 selain gambar utama; logo/ikon/iklan/GIF dibuang), juga artikel tanpa `news_image`.
- **Filter teks di gambar: Semua | Ada teks | Tanpa teks** (Media visual), menggantikan tombol "Ada teks", bawaannya "Ada teks" (`&text=all` untuk semua); "Tanpa teks" = tidak ada teks penting (kosong, atau hanya tampilan aplikasi/stempel/ulangan caption). API `&text=1|0`.
- **OCR gambar kecil lebih lengkap** (Media visual): gambar di bawah 1.000 px diperbesar (maks. 2×) sebelum OCR; teks kecil di foto berita 730 px yang tadinya di bawah ambang keyakinan kini terbaca. Pemecah kata tergabung mengenal angka Romawi di teks kapital ("PERSIDANGANI" → "PERSIDANGAN I", bukan "PER SIDANG ANI"); teks gambar lama diturunkan ulang (`TEXT_RULES_VERSION` 3).
- **Gambar Instagram dan Threads** (Media visual): worker mengambil `og:image` halaman publik post (cara yang dianjurkan Meta sejak oEmbed tidak lagi memberi thumbnail, Nov 2025), 1 halaman/dtk, maks. 60 post per baca, hanya ±16 KB awal halaman. Foto profil (post Threads tanpa gambar) dan logo situs (post dihapus) dibuang; halaman login atau 429 menghentikan baca dan kursor tetap di post terakhir. Jenis `instagram`/`threads`, filter sumber baru. Facebook (halaman minta login) dan TikTok (oEmbed tanpa thumbnail) tidak diambil.
- **Modal Media visual lebih lebar dan rapi**: maks. 1.440 px setinggi layar; gambar mengisi kolom kiri (tangkapan layar tinggi terbaca) dengan info ukuran di bawahnya; kolom kanan dimulai ringkasan chip (tag, perlu ditinjau, ajakan aksi, klaim, aksara lain), teks post dilipat 5 baris dengan "Selengkapnya" dan tautan disingkat ke nama situs; catatan analisis di bawah.
- **Model tag visual terlatih** (Media visual): 1.150 gambar produksi dilabeli; klasifikasi linear di atas CLIP, dimulai dari bobot teks CLIP dan dikalibrasi (`scripts/media/latih_tag.py`, `tag_model.npz`). Set uji tetap 286 gambar: tag utama tepat 53,5% → 66,4%, longgar 69,6% → 77,6%. Tag sensitif tetap dari zero-shot (ambang 0,65). Model `media-clip-b32-v3`.
- **Statistik gambar tidak terbaca** (Media visual): kartu "tidak terbaca" di header per periode dan sumber, dengan rincian saat disorot: dihapus situsnya (404/410), ditolak situs (403), timeout/koneksi (dan yang masih dicoba ulang), lainnya.
- **Peringatan worker media** (admin): ikon merah di header semua halaman bila worker Media visual tidak berdetak 15 menit atau layanan analisis tidak menjawab; klik ke Media visual. API `GET /api/admin/media-visual/worker`.
- **Teks beraksara lain** (Media visual): gambar yang teksnya terdeteksi tapi hampir semua di bawah ambang keyakinan OCR (biasanya Arab, Kirill, Mandarin) ditandai `unreadText`, lencana "Aksara lain" dan filter `&unread=1`.
- **Ajakan aksi dari gambar** (kata ajakan + tanggal/jam/tempat): panel "Rencana aksi dari gambar" di halaman EWS (admin), filter di Media visual.
- **Narasi terkoordinasi**: tampilan "Narasi" mengelompokkan post dengan pesan gambar yang sama (≥3 post), termasuk gambar yang didesain ulang.
- **Klaim angka untuk dicek** dari teks gambar (persen, rupiah, jumlah), dengan filter dan bagian di modal.
- Klasifikasi AI per proyek dan sampel Ringkasan AI ikut membaca teks gambar (`[Teks di gambar]`).
- **Penjelasan di setiap kartu Ringkasan**: ikon ⓘ di samping judul membuka penjelasan singkat dan "Cara membaca" (perbandingan, warna, ambang). Teks di `src/components/overview/CardHelp.tsx`.
- Panel memakai **tema gelap sebagai bawaan** (sebelumnya mengikuti sistem); pilihan yang tersimpan di browser tetap dipakai.
- **Kartu Media Online didesain ulang**: media + penulis di header, satu baris chip (kategori lalu topik AI, tanpa "#" agar tidak dikira tagar), footer satu baris. Kartu dibedakan per sentimen: garis atas, tepi, dan latar merah (negatif) / hijau (positif) / biru (netral), badge sentimen solid dengan ikon.
- **Akun demo** (`Admin.demo`): tidak melihat menu "Paket & tagihan", chip paket, maupun banner paket/kuota; `/billing` dialihkan ke Beranda. Anggota mengikuti akun utamanya. Diatur admin lewat sakelar "Akun demo" di modal Paket dan saat membuat akun utama klien; badge "Demo" di daftar Pengguna.
- **Lightbox gambar**: gambar post asli X dan gambar di modal detail dibuka layar penuh; panah, keyboard (←/→/Esc), geser di layar sentuh, penghitung dan thumbnail bila lebih dari satu gambar.
- **Modal detail post baru**: dua kolom (isi post di kiri; label manual, kategorisasi AI, analisis sumber, konteks, dan kode di kanan) tanpa tab, tinggi mengikuti isi; header berisi akun/media, pengikut, waktu, dan emosi. Label manual bisa diberi langsung dari modal.
- **Label manual per proyek** (terpisah dari kategorisasi AI): tab "Label manual" di detail proyek untuk mengatur pilihan label (pemilik proyek dan admin; maks. 30 label, 40 karakter). Bila proyek punya pilihan label, setiap kartu Media Sosial/Online yang dilihat lewat proyek itu (Quick dan Original View) menampilkan dropdown label; pemilik, admin, dan anggota klien dapat memberi label, viewer hanya melihat. Menghapus pilihan melepas label itu dari post. Tabel `ItemLabel`, kolom `ApiKey.manualLabels`; API `GET`/`PUT /api/admin/keys/[id]/labels`, `PUT /api/admin/keys/[id]/item-labels`.
- Label manual tampil sebagai strip di bagian atas kartu (Quick dan Original View) dengan menu pilihan; tiap label punya warna tetap sesuai urutannya. Pengaturan label didesain ulang: jumlah post per label, pratinjau, contoh label, ganti nama langsung (post ikut pindah ke nama baru, `renames` di `PUT /api/admin/keys/[id]/labels`), urutan naik/turun, hapus label yang sedang dipakai lewat jendela peringatan (jumlah post yang kehilangan label; bila dilanjutkan label langsung dilepas dari post-post itu).
- **Filter label manual**: bagian "Label manual" di Filter lanjutan (satu label atau semua yang sudah diberi label), bisa digabung dengan filter lain dan kategori AI (`?label=`, `__any`).
- **Label manual di API publik**: item membawa `manualLabel` (hanya untuk kunci yang punya pilihan label), `?label=` menyaring (juga dengan `view=summary` dan `aiCategory`), `view=options` menyertakan `manualLabels`. Didokumentasikan di halaman Dokumentasi API.
- **Akun dibuat admin & sub-akun klien** (halaman Pengguna): tombol "Tambah pengguna" membuat akun langsung aktif — **akun utama klien** (memegang paket, kuota, dan proyek), **anggota klien** (`Admin.parentId`: ikut paket, masa berlaku, dan status akun utamanya; nonaktifkan akun utama = anggotanya ikut terkunci), atau **viewer**. Admin baru tetap dibuat manual.
- Halaman Pengguna: anggota klien dikelompokkan di bawah akun utamanya (tab mengikuti status akun utama, tombol "Tambah anggota" di kelompok); akun admin dan viewer tampil di atas sebagai satu kelompok "Tim internal" (admin hanya-baca, yang login ditandai "(Anda)"). Pilihan akun di Tagihan hanya akun utama klien.
- Tombol **Proyek** per akun: untuk akun utama memilih proyek admin yang menjadi miliknya (yang dilepas kembali ke admin); untuk anggota memilih proyek akun utama yang boleh dilihatnya (tabel `ProjectMember`). Anggota hanya melihat data proyek itu: tidak bisa mengubah, mencabut, menyalin kunci, atau membuat proyek; kuota API/AI tetap dihitung di akun utama. API: `POST /api/admin/users`, `GET`/`PUT /api/admin/users/[id]/projects`.
- Pencarian Media Sosial/Online menunggu 2 dtk selama teks yang diketik kurang dari 4 karakter (selain itu 1 dtk), supaya tidak mencari kata yang belum selesai diketik.
- **Pencarian dengan OR** di Media Sosial/Online: `polisi or polri` (atau `polisi | polri`) menampilkan konten yang mengandung salah satunya; kata dalam satu alternatif tetap harus muncul semua, maksimal 8 alternatif. Tetap full-text bahasa Indonesia dengan stemming (`searchTerms` di `lib/server/bank/query.ts`).
- Filter proyek di `/isu/ews` menyembunyikan proyek yang namanya mengandung "slog" (hardcode sementara, `isHiddenEwsProject` di `src/lib/issues.ts`; `/isu` tidak terpengaruh).
- **Tema gelap**: situs publik (beranda, harga, integrasi, kontak, legal) selalu gelap. Panel punya mode gelap dengan tombol bulan/matahari di bar atas; bawaan mengikuti sistem (`defaultColorScheme="auto"`), pilihan disimpan di browser. Laporan dan brief cetak (A4) tetap terang.
- **Halaman Ringkasan didesain ulang**: hero memuat filter (Semua / Media Sosial / Media Online, 7/14/30 hari) dan deretan KPI dengan sparkline; filter ikut menempel di atas saat halaman digulir. Engagement jadi tabel per platform dengan baris total; tren memakai garis rata-rata. Kartu Ringkasan AI tampil ringkas (3 sorotan + yang perlu diwaspadai) dengan tombol "Baca analisis lengkap".
- Halaman Ringkasan: "Sinyal terbaru" dipecah jadi **Sinyal Terbaru Sosial Media** dan **Sinyal Terbaru Media Online**; kartu "Aplikasi terhubung" dihapus.
- Media Sosial/Online: grid **maksimal 4 kolom**; skeleton berbentuk kartu (bukan blok polos) saat memuat, dan `loading.tsx` menampilkan kerangka halaman saat berpindah ke halaman media.
- Halaman error (404, 500, pembaruan, offline) didesain ulang, selalu gelap; 404 menampilkan alamat yang tidak ditemukan.

### Diperbaiki
- Media visual: model CLIP fp32 (versi 8-bit memberi skor menyimpang di CPU server x86 AVX2 tanpa VNNI), kelas pembanding "_tinjau" dibuang, ambang per tag disetel dari 254 gambar produksi yang dilabeli: tag utama tepat 58% → 63%, tepat atau tertukar dengan tag mirip 68% → 77% (diuji di separuh sampel yang tidak dipakai menyetel); ambang sensitif 0,65.
- Media visual: dua gambar dianalisis sekaligus (`MEDIA_PARALLEL`, bawaan 2; satu mesin OCR/CLIP per analisis): ±2× lebih cepat (uji lokal 12 gambar 8,3 → 4,2 dtk); analisis per putaran dibatasi waktu (`MEDIA_ANALYZE_BUDGET_MS`, bawaan 3 menit), bukan 120 gambar, agar waktu mengambil post tidak mendominasi.
- Media visual: batas waktu unduh gambar 12 → 20 dtk (CDN berita lambat: ±190 gambar gagal karena timeout). Gambar yang ditolak situs (403) atau sudah dihapus (404) tetap ditandai hilang.
- Media visual: kursor `…:back` berita dan YouTube membaca 1.500 item per putaran (`MEDIA_BACK_BATCH`); X tetap 300 (batas FxTwitter).
- Media visual: kolektor membaca post **terbaru dulu**: kursor kepala (`…:head`) maju membaca post baru, kursor `…:back` mengisi celah dari hari ini mundur ke posisi kursor lama; antrean analisis diurutkan dari post terbaru per hari. Sebelumnya halaman "3 hari" bisa kosong selama worker masih mengejar data beberapa hari ke belakang.
- Media visual: tag "Poster / grafis" lebih sering tepat (15/48 → 26/48 poster di sampel berlabel; tag utama 59% → 64%) dengan tiga kalimat pembanding baru (thumbnail berita berjudul, desain grafis kolase, spanduk pengumuman).
- Media visual: kata yang tergabung di hasil OCR dipisah lagi dengan kamus kata dari bank data (`src/lib/server/media/kata.txt`, ±47 ribu kata): "PENJAGAHUTANINDONESIA" → "PENJAGA HUTAN INDONESIA"; kata Inggris dan nama tetap utuh. Ajakan aksi kini butuh kata seruan (ayo, hadiri, bergabung, …) dan menolak teks laporan (tinjau, diamankan, ricuh, …); berita "Kapolri Tinjau Kericuhan Demo…" tidak lagi terbaca sebagai ajakan. Gambar yang sudah dianalisis diperbarui otomatis dari baris OCR tersimpan.
- Banner proyek di Media Sosial/Online tidak lagi menampilkan baris keterangan keyword ("Menyebut …"), batasan, dan status kategorisasi AI.
- Daftar post Media Sosial/Online tidak lagi 1–4 dtk per halaman untuk proyek berkata kunci luas: urutan kode per halaman di-cache 60 dtk (stale-while-revalidate; isi item, label manual, dan kategori AI tetap segar). Warmer kini juga menyiapkan halaman pertama, total cocok, dan bar emosi Media setiap proyek (sesuai batas riwayat paket pemiliknya), sehingga total cocok tidak lagi ±53 dtk setelah restart.
- Halaman EWS: filter level jadi satu grup "Level" (titik warna dan jumlah alert per level); daftar alert kembali bisa digulir dengan judul tetap.
- Laporan eksekutif: "Keputusan yang dibutuhkan" tampil sebagai panel bernomor dengan chip tenggat ("Segera" merah, lainnya kuning).
- Halaman EWS (dan Ontologi) tidak lagi lambat saat Ringkasan sedang dihitung: query alert (±5 ms) pindah dari pool analytics ke pool utama, sebelumnya bisa antre hingga beberapa menit.
- Kartu Peringatan dini: status "Naik" (kuning) untuk kenaikan di bawah ambang Waspada; Normal kini abu-abu netral (bukan hijau); warna status juga tampil di mode gelap.
- Daftar Peringkat isu: hanya kartu yang bergulir (judul tetap), scrollbar tipis, kartu tidak lagi menempel ke scrollbar. Label, angka, dan filter "Berlangsung" disembunyikan.
- Angka berat untuk proyek berkata kunci luas tidak lagi membuat pengguna menunggu: total cocok, total API publik (`view=summary`), dan opsi filter memakai cache stale-while-revalidate (angka lama langsung tampil, diperbarui di latar belakang); Ringkasan 14/30 hari di-cache 30 menit sehingga warmer jauh lebih ringan dan pool analitik tidak antre (total cocok SLOG POLRI sempat ±57 dtk).
- **Media Sosial/Online lemot untuk proyek berkata kunci luas** (mis. SLOG POLRI setelah ditambah "polri, polisi": sebaran emosi ±13 dtk, feed ikut gagal 503 saat database sumber sibuk): daftar post tidak lagi menunggu bar emosi; bar emosi dimuat lewat `view=moods` tersendiri di pool analitik (timeout 60 dtk, cache 10 menit), jadi tidak lagi memakai koneksi daftar post.
- Warmer cache (`warmOverview`) hanya berjalan di produksi (atau dengan `WARM_CACHES=1`): `npm run dev` pengembang membaca database sumber yang sama dan ikut menambah beban.
- `deploy.sh` menolak host yang tidak punya `/var/www/signalbase` (mis. server lama) dengan pesan yang jelas.
- Filter lanjutan Media Sosial/Online tidak lagi memuat data setiap kali satu pilihan diubah: pilihan masuk draf ("N belum diterapkan") dan baru dimuat saat "Terapkan · N perubahan"; menutup panel atau "Batalkan" membuang draf.
- Catatan sumber di bawah post asli ("Dari FxTwitter · dimuat …", "Pratinjau resmi …") dihapus; tab "Post asli / Data tersimpan" menjadi sakelar pil.
- Kotak cari Media Sosial/Online: kursor tidak lagi melompat ke akhir saat menghapus huruf di tengah teks (input memegang teksnya sendiri, nilai dari URL hanya dipakai bila berubah dari luar).
- Ringkasan: pilihan **14 dan 30 hari** tidak lagi menunggu ±25 dtk saat pertama dibuka; warmer (`warmOverview`) kini juga menyiapkan periode 30 dan 14 hari (setelah semua periode 7 hari), untuk seluruh bank dan tiap proyek. Bagian terberat: engagement per platform (±19 dtk untuk 60 hari data).
- Video X di Original View tidak lagi menampilkan scrollbar kecil di sisi kanan (video inline menyisakan celah baseline di dalam iframe).
- Hydration error di panel: tombol tema kini merender markup yang sama di server dan browser (ikon dipilih lewat CSS).

## 2026-11-17

### Ditambahkan
- **Filter Proyek / Isu** di filter lanjutan Media Sosial/Online (bagian Sumber & konten): proyek aktif ber-kata kunci; hasil = konten yang menyebut salah satu kata kunci proyek (OR). Akun user hanya melihat proyek miliknya; berlaku juga bersama `?key=` (irisan). Param `project`, diterjemahkan server ke `pkw`.

## 2026-11-16

### Ditambahkan
- Alat model QW lokal: `scripts/indobert/relabel-latih.ts` (label ulang data latih, opsi tanpa alasan), `emas-media.ts` dan `uji_emas_media.py` (data uji emas berlabel manual).
- **Biaya AI proyek** di tab AI halaman detail proyek (admin dan viewer; tidak untuk akun klien): biaya yang dibayar key DeepSeek milik Signalbase (`SIGNALBASE_AI_API_KEY`) untuk kategorisasi dan Ringkasan AI proyek itu; bulan ini, perkiraan sebulan, rata-rata per hari, porsi IndoBERT, grafik harian bertumpuk per modul, padanan Rupiah (kurs live). Key milik klien (mis. KIPERMAS) tidak dihitung. `TokenUsage.keyHint` mencatat 4 huruf terakhir key yang membayar (sejak 16 Nov 2026); harga per model di `src/lib/ai/pricing.ts`.
- Biaya AI (Pengaturan AI dan pemakaian key per proyek) kini juga tampil dalam Rupiah dengan kurs USD→IDR live dari open.er-api.com (`src/lib/server/kurs.ts`, disimpan 6 jam). Harga bawaan Pengaturan AI disamakan dengan harga resmi `deepseek-flash` rata-rata (±20% jam sibuk): 0,18 / 0,0036 / 0,72 USD per 1 juta token.
- API publik `GET /api/v1/usage?days=` (1–90): token AI kategorisasi untuk kunci pemanggil, per hari (WIB) dan model, supaya pemilik kunci bisa menghitung biayanya sendiri.

### Diperbaiki
- Kategorisasi QW: `LOCAL_QW_MIN=0` kini berarti semua post dilabel model lokal (sebelumnya terbaca 0,8). Layanan model lokal menerapkan aturan kata kunci QW3/QW8/QW5; prompt preset Quick Win memakai aturan pembeda yang sama dengan pbm. Ringkasan AI: batas token keluaran 16.000, percobaan ulang setelah 3 menit.
- `GET /api/v1/usage` dan grafik "Penggunaan saldo" per proyek kini hanya memakai token dan saldo dari key penyedia yang sedang dipakai (`classifierKeyHint`, `keySince` di `src/lib/server/ai/platform.ts`). Sebelumnya token dan saldo key KIPERMAS dari masa key dipakai bersama ikut terhitung, sehingga biaya Signalbase di pbm terhitung dua kali dan grafik menampilkan saldo 1,03 lalu "isi ulang" palsu ke 6,01.

## 2026-11-13

### Ditambahkan
- Tampilan **post X** di panel (modal dan Original View) digambar mirip aslinya: avatar 42 px, nama tebal, teks 15 px, media bersudut membulat berbingkai, logo X (tautan ke post), jam di bawah isi. Tetap dari kode kita (`OriginalXPost.tsx`, `originalXPost.module.css`), data dari `react-tweet`/FxTwitter.
- Di Media Sosial ada pilihan **Quick View | Original View**: kartu Quick tampil langsung, post asli (X, TikTok/YouTube, Threads) dimuat diam-diam di belakang lalu menggantikan kartu dengan transisi; gagal/tidak tersedia = tetap Quick dengan chip. Instagram/Facebook tetap Quick dengan tombol "Lihat tampilan asli" (tidak bisa dideteksi bila post privat/dihapus). Embed dimuat hanya untuk kartu dekat layar, maksimal 4 serentak; Original View adalah default; pilihan disimpan di URL (`?tampilan=quick|asli`) dan `localStorage`.
- **Laporan eksekutif** di Ringkasan (kartu Analisis periode): tombol membuka dialog (periode 1/3/7 hari, default 1) untuk penerima ("Untuk") dan sifat (default RAHASIA / TERBATAS), lalu membuka halaman cetak `/laporan?days=1|3|7&key=&untuk=&sifat=` di tab baru yang otomatis memanggil dialog cetak browser (Simpan sebagai PDF, tanpa Chromium di server). Isi A4: sampul, ringkasan eksekutif (suhu isu, volume, isu teratas), halaman media sosial dan media online (angka kunci, volume harian, emosi, kategori, akun/platform atau media/kata kunci), matriks prioritas isu EWS, kartu isu prioritas ("Implikasi" = `risk_assessment`; kolom "Tindakan & tenggat" disembunyikan), penutup metodologi. Halaman laporan per proyek/semua data: sampul, ringkasan, media sosial, engagement & hashtag (like/komentar/share/views per platform), media online, peringatan dini (24 jam vs rata-rata 7 hari: post intens, porsi negatif, lonjakan topik, kutipan post negatif paling intens), isu media online (tidak ikut di mode "Semua proyek" user), matriks isu EWS + metodologi, aktor/target/wilayah dari isu EWS, kartu isu prioritas. Tidak ada: SNA, wilayah berita online. Halaman terakhir berupa penutup bergaya sampul ("Terima kasih") dengan narasi semi-dinamis (cakupan, volume, suhu isu, isu teratas). Nama berkas PDF yang diusulkan browser: `Laporan Eksekutif - <Semua Data|Semua Proyek|nama proyek> - <N> hari - <YYYYMMDD-HHmmss>` (dari judul halaman). Halaman `/laporan` punya tombol **Download PDF** (html-to-image + jspdf, dibuat di browser; teks di PDF berupa gambar) dan tombol Cetak; dialog cetak tidak lagi terbuka otomatis. Tombol di Ringkasan bernama **Laporan eksekutif**; dialognya punya pilihan **Sumber data**: admin boleh "Semua data" atau satu proyek; user boleh satu proyek atau "Semua proyek saya" (bila punya lebih dari satu; satu dokumen berisi halaman perbandingan proyek lalu blok halaman per proyek, maksimal 5 proyek). API `GET /api/admin/report?days=1|3|7&key=<id>|all`, tetap divalidasi lewat `overviewView`/`ownsKey`.

### Diperbaiki
- Infinite scroll Media Sosial/Online memuat halaman berikutnya lebih awal: pemicu 2000 px di bawah layar (sebelumnya 800 px), sehingga data baru sudah siap sebelum sampai dasar daftar.
- Video di post X (Original View) tidak bisa diputar: `video.twimg.com` membalas 403 bila permintaan membawa Referer dari domain lain (bukan karena `?tag=`, yang tidak berpengaruh). Video kini dimuat di iframe `srcdoc` dengan `referrer=no-referrer` (`xVideoFrame` di `src/lib/media/xPost.ts`).

### Diubah
- Penjelajah media: pilihan tampilan hasil **Kartu / Daftar ringkas** dihapus; semua hasil selalu berupa kartu (parameter `?layout=` tidak dipakai lagi).

## 2026-11-12

### Ditambahkan
- Submenu **Isu** diganti menjadi **Isu Media Online** (`/isu`, halaman isu berita yang sudah ada) dan **Isu EWS Sosmed** (`/isu/ews`). Topik Polisi tidak lagi punya menu, tetapi `/isu?topik=polisi` masih berfungsi.
- Halaman **Isu EWS Sosmed** (`/isu/ews`): alert peringatan dini dari tabel `alerts`, tampilan selaras Isu Media Online (hero, toolbar, daftar peringkat kiri, detail kanan). Toolbar: periode 1/3/7/14 hari dan 1 bulan (default 7), proyek (aktor/target mengandung kata kunci), toggle level Critical/High, pencarian judul/aktor/lokasi, dan filter entitas (klik chip aktor/target). Detail: ringkasan kejadian, reaksi publik, penilaian risiko, aktor, target, sinyal, post representatif. Memakai `GET /api/admin/ontologi`.
- Halaman **Ontologi** (`/analisis/ontologi`): graf d3 keterkaitan isu (alert EWS dari tabel `alerts`) dengan aktor dan target yang disebut di `alert_data`; tampilan sama dengan SNA (hero, toolbar, legenda lipat, kunci graf, layar penuh, panel geser). Isu = lingkaran putih dengan border level (Critical/High, toggle di legenda), aktor ungu, target biru muda; satu isu per klaster (alert terbaru). Rentang 1/3/7/14 hari dan 1 bulan (default 7). Filter proyek: isu dipertahankan bila aktor atau targetnya mengandung kata kunci proyek. API `GET /api/admin/ontologi?days=[&key=]`.
- Halaman **SNA** (`/analisis/sna`): graf jaringan d3 — 25 akun dengan post terbanyak (yang menyebut akun lain) jadi simpul utama, akun yang mereka sebut jadi simpul anak (maks. 15 per simpul utama). Garis merah = marah/menolak/kecewa/sarkasme, biru = netral, hijau = mendukung/puas, abu = tanpa emosi (warna dominan bila campur; tooltip merinci); tebal garis mengikuti jumlah mention. Rentang 1/3/7 hari (default 1), filter proyek (Nasional untuk admin), seret/zoom, klik simpul untuk menyorot, tautan ke post akun di Media Sosial. API `GET /api/admin/sna?days=1|3|7[&key=]` (cache 60 detik, mengikuti cakupan kunci). Klik node membuka panel geser dari kanan (tab Ringkasan, Postingan, Mention) lewat `GET /api/admin/sna/account?username=&role=hub|child&days=[&key=]`; hover hanya menampilkan tooltip singkat. Filter "Maks. 25/50/100/200 akun top poster" (`?limit=`), tombol kunci graf (default terkunci) dan layar penuh, legenda yang bisa dilipat.
- Menu **Analisis** (di antara Isu dan Proyek) dengan submenu **SNA** (`/analisis/sna`) dan **Ontologi** (`/analisis/ontologi`); `/analisis` mengarah ke SNA. Ontologi masih berupa penanda "Sedang dalam pengembangan".
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
