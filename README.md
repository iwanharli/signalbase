# Signalbase

**Bank data media** — panel dan API yang membuka koleksi post media sosial dan berita online (dari database sumber) untuk aplikasi lain, misalnya KIPERMAS, lewat kunci API yang cakupannya bisa dibatasi dengan kata kunci.

```
┌──────────────┐  read-only   ┌──────────────────────────────┐  HTTPS + kunci API  ┌────────────┐
│  DB sumber   │ ───────────▶ │  Signalbase                   │ ──────────────────▶ │  KIPERMAS  │
│  (Postgres)  │              │  • panel admin (jelajah data) │   /api/v1/media/*   │  & aplikasi│
│  post, berita│              │  • kunci API + kata kunci     │                     │  lain      │
│  analisis AI │              │  • API publik berkunci        │                     └────────────┘
└──────────────┘              └──────────────┬───────────────┘
                                             │ Prisma
                                     ┌───────▼────────┐
                                     │ DB Signalbase  │  admin, kunci API
                                     └────────────────┘
```

Signalbase **tidak menyalin** data media: setiap permintaan membaca database sumber secara langsung (transaksi read-only). Database Signalbase sendiri hanya menyimpan akun admin dan kunci API.

---

## Daftar isi

1. [Fitur](#fitur)
2. [Teknologi](#teknologi)
3. [Menjalankan secara lokal](#menjalankan-secara-lokal)
4. [Variabel lingkungan](#variabel-lingkungan)
5. [Perintah npm](#perintah-npm)
6. [Panel admin](#panel-admin)
7. [API publik](#api-publik)
8. [Sumber data & pemetaan kolom](#sumber-data--pemetaan-kolom)
9. [Performa & cache](#performa--cache)
10. [Keamanan & privasi](#keamanan--privasi)
11. [Struktur kode](#struktur-kode)
12. [Konvensi](#konvensi)
13. [Deploy produksi](#deploy-produksi)
14. [Pemecahan masalah](#pemecahan-masalah)

---

## Fitur

**Panel admin** (login dengan akun admin)

- **Ringkasan** — volume 7 hari per jenis media (dengan perubahan vs minggu sebelumnya), grafik batang 14 hari, sebaran emosi/sentimen, sinyal terbaru, dan daftar aplikasi terhubung.
- **Media Sosial / Media Online** — jelajah seluruh isi database sumber:
  - kartu *masonry* dengan *infinite scroll*, gambar berita, metrik interaksi, ringkasan AI;
  - **modal detail** per item: teks lengkap, analisis AI (ringkasan, target, skor emosi, sinyal/topik, faktor, relevansi), kategori, lokasi, tautan sumber;
  - **bar statistik** menempel di bawah topbar: total pasti, jumlah ditampilkan, rentang, status analisis, bahasa, sumber, dan sebaran emosi/sentimen yang bisa diklik sebagai filter;
  - **filter cepat**: pencarian (tekan `/`), rentang 24 jam / 7 / 30 hari / semua, urutan terbaru/terlama;
  - **filter lanjutan** (drawer kiri): status analisis, relevansi AI, emosi/sentimen, intensitas minimal, platform/media, kategori, jenis post, bahasa, hanya bergambar, rentang tanggal, provinsi.
- **Kunci API** — buat kunci (ditampilkan sekali), batasi dengan kata kunci, cabut, lihat terakhir dipakai.
- **Dokumentasi API** — referensi endpoint di dalam panel.

**API publik** `GET /api/v1/media/{social|online}` — daftar item terpaginasi atau ringkasan (`view=summary`), dibatasi kata kunci milik kunci API.

---

## Teknologi

| Bagian | Pilihan |
|---|---|
| Framework | Next.js 15 (App Router, Turbopack di dev), React 19, TypeScript |
| UI | Mantine 7, Tabler Icons, CSS Modules |
| Database Signalbase | PostgreSQL + Prisma 6 |
| Sumber data | PostgreSQL database sumber via `pg` (read-only) |
| Auth panel | Sesi JWT (HS256, `jose`) di cookie httpOnly; password admin bcrypt |
| Validasi | Zod |

Butuh **Node.js 18.18+** (diuji dengan Node 22) dan **PostgreSQL** (lokal atau server).

---

## Menjalankan secara lokal

### Cara cepat

```bash
./run.sh            # mode pengembangan → http://localhost:3100
./run.sh prod       # build lalu jalankan mode produksi
PORT=4100 ./run.sh  # port lain
```

`run.sh` akan:
1. membuat `.env` dengan `AUTH_SECRET` dan password admin acak bila belum ada (isi `SOURCE_DATABASE_URL` sendiri);
2. memastikan PostgreSQL hidup dan database Signalbase ada (dibuat otomatis);
3. memasang dependensi bila `package-lock.json` berubah;
4. menyinkronkan skema Prisma dan membuat admin awal;
5. menjalankan server.

### Cara manual

```bash
cp .env.example .env          # lalu isi nilainya (lihat tabel di bawah)
createdb signalbase
npm install
npx prisma db push            # buat tabel Admin & ApiKey
npm run db:seed               # buat admin pertama dari ADMIN_USERNAME / ADMIN_PASSWORD
npm run dev                   # http://localhost:3100
```

> Seed hanya membuat admin bila tabel admin masih kosong. Untuk mengganti password admin yang sudah ada, perbarui `passwordHash` (bcrypt) di tabel `Admin`.

---

## Variabel lingkungan

| Nama | Wajib | Keterangan |
|---|---|---|
| `DATABASE_URL` | ya | Postgres milik Signalbase (admin & kunci API). Contoh: `postgresql://user@localhost:5432/signalbase` |
| `SOURCE_DATABASE_URL` | ya | Postgres database sumber (data media). Cukup akun **read-only**; koneksi juga dipaksa `default_transaction_read_only=on`. |
| `AUTH_SECRET` | ya | Kunci tanda tangan sesi, minimal 32 byte acak. Buat dengan `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ADMIN_USERNAME` | seed | Username admin pertama (default `admin`). |
| `ADMIN_PASSWORD` | seed | Password admin pertama. Hanya dipakai saat seed. |
| `HIDDEN_SUMMARY_TERMS` | tidak | Nama dashboard internal (dipisah koma). Anak kalimat ringkasan AI yang menyebutnya, atau kata "dashboard", dibuang sebelum dikirim. |
| `PORT` | tidak | Port untuk `run.sh` (default 3100). |
| `NEXT_DIST_DIR` | tidak | Folder build alternatif agar server kedua tidak berbagi `.next`. |

`.env` dan semua varian `.env*` **diabaikan git** (kecuali `.env.example`). Jangan pernah meng-commit kredensial.

---

## Perintah npm

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Server pengembangan di port 3100 (Turbopack) |
| `npm run build` | Build produksi |
| `npm start` | Jalankan hasil build |
| `npm run lint` | ESLint |
| `npm run db:push` | Sinkronkan skema Prisma ke database |
| `npm run db:seed` | Buat admin pertama (aman dijalankan berulang) |
| `npm run classifier` | Worker kategorisasi AI (berjalan terus) |
| `npx tsc --noEmit` | Pemeriksaan tipe |

---

## Panel admin

| Halaman | Path | Isi |
|---|---|---|
| Login | `/login` | Username & password admin. 5 kali gagal per 15 menit → dikunci sementara. |
| Ringkasan | `/` | Statistik bank 7/14 hari, sinyal terbaru, aplikasi terhubung. |
| Media Sosial | `/media/social` | Jelajah post. `?mood=marah` membuka langsung dengan filter emosi. |
| Media Online | `/media/online` | Jelajah berita. |
| Kunci API | `/api-keys` | Daftar kunci: cakupan, terakhir dipakai, cabut. |
| Buat kunci | `/api-keys/new` | Nama, kata kunci (diketik sendiri), dan parameter cakupan tetap: jenis media, status analisis, relevansi, bahasa, provinsi, kategori, intensitas min. Kunci ditampilkan sekali beserta contoh curl. |
| Detail kunci | `/api-keys/[id]` | Ubah nama, kata kunci, dan parameter cakupan tanpa mengganti nilai kunci; ringkasan kategorisasi AI; cabut kunci. Mengubah cakupan mengulang kategorisasi AI kunci itu. |
| Kategorisasi AI kunci | `/api-keys/[id]/ai` | Penyedia, prompt, kategori, batas harian, progres, dan sebaran per kategori. |
| Pengaturan AI | `/settings/ai` | Penyedia AI (Claude, DeepSeek, OpenAI, kompatibel OpenAI) dan uji koneksi. |
| Dokumentasi API | `/docs` | Referensi API di dalam panel. |

### Aturan filter yang saling terkait

- **Status analisis = Belum** → filter emosi dan intensitas dikosongkan (data belum berlabel).
- **Relevansi = Tidak relevan** → status analisis diubah ke *Semua*, karena post yang dikecualikan AI tidak diberi label emosi.
- Default media sosial: **Sudah dianalisis** + **Relevan** (post yang dikecualikan AI disembunyikan).
- Sebaran emosi/sentimen mengabaikan filter emosi agar semua bagian tetap terlihat.

---

## API publik

Detail lengkap (parameter, contoh, respons): **[docs/API.md](docs/API.md)**.

```bash
curl -H "Authorization: Bearer $SIGNALBASE_KEY" \
  "https://<host>/api/v1/media/online?from=2026-11-01&mood=negative&size=50"
```

- Autentikasi: `Authorization: Bearer <kunci>` atau `x-api-key: <kunci>`.
- Setiap kunci hanya membaca item yang **menyebut salah satu kata kuncinya** (pencarian teks penuh; frasa multi-kata dicocokkan sebagai frasa; "polisi tidur" tidak dihitung sebagai "polisi"). Kunci tanpa kata kunci membaca seluruh bank.
- Total dibatasi 10.000 agar setiap permintaan tetap cepat; `capped: true` menandakan batas tercapai.

---

## Sumber data & pemetaan kolom

| Field API | Media sosial (`post_main` p + `post_analyses` a) | Media online (`news_main` n + `news_analyses` a) |
|---|---|---|
| `id` | `p.post_code` | `n.news_code` |
| `source` | `p.post_source` | `n.news_source` |
| `title` | — | `n.news_title` |
| `content` | `p.post_content` | `n.news_preview` |
| `url` | — *(sengaja tidak dikirim)* | `n.news_url` |
| `image` | — | `n.news_image` |
| `publishedAt` | `p.post_timestamps` | `n.news_timestamp` |
| `postType` | `p.post_type` | — |
| `category` | `a.category` | `n.news_category_label` |
| `province` | `a.province_id` → nama provinsi | `n.region_code` → nama provinsi |
| `location` | `a.location` | — |
| `mood` | `a.emotion` (emosi) | `a.sentiment` (positive/neutral/negative) |
| `moodLevel` | `a.emotion_level` (1–5) | — |
| `metrics` | `p.additional_data` (like, comment/reply, retweet/repost/share, view) | — |
| `analysis.summary` | `a.summaries` (tanpa catatan dashboard internal) | — |
| `analysis.target` | `a.emotion_target` | — |
| `analysis.score` | `a.emotion_score` | — |
| `analysis.signals` | `a.signal` | — |
| `analysis.topics` | — | `a.topics.items` |
| `analysis.factors` | `a.factors` (jenis, korban, pelaku, kerugian, intensitas) | — |
| `analysis.relevance` | `a.status_filter` (include/watchlist/exclude) | — |

Penyaringan tetap:
- Timestamp di luar `2010-01-01 … sekarang` diabaikan (galat scraper).
- Post bertipe `spam` selalu disembunyikan.

---

## Performa & cache

Tabel database sumber berisi jutaan baris, jadi:

| Data | Strategi | Cache |
|---|---|---|
| Daftar item | `ORDER BY timestamp LIMIT/OFFSET`, lalu ambil detail per kode | — |
| Total pasti (panel) | `count(*)` terpisah, timeout 90 detik; daftar tidak menunggu | 10 menit |
| Total terbatas (API) | `count` atas maksimal 10.000 baris | 2 menit |
| Sebaran emosi/sentimen | Dihitung dari 10.000 data terbaru yang cocok | 2 menit |
| Volume harian | 14 hari, seluruh bank | 5 menit |
| Pilihan filter | sumber, emosi, kategori, provinsi | 1 jam |

Cache berada di memori proses (`lib/server/bank/cache.ts`) dan menyimpan *promise*, sehingga permintaan yang bersamaan berbagi satu query. Kegagalan tidak di-cache.

---

## Keamanan & privasi

- **Read-only ke database sumber**: setiap transaksi `default_transaction_read_only=on`; semua nilai filter dikirim sebagai parameter terikat (bebas SQL injection).
- **Kunci API** hanya disimpan sebagai hash SHA-256; nilai asli ditampilkan sekali saat dibuat. Kunci bisa dicabut kapan saja.
- **Sesi admin**: JWT HS256 di cookie `httpOnly`, `sameSite=lax`, `secure` di produksi, berlaku 12 jam. Middleware menjaga semua halaman panel dan `/api/admin/*`.
- **Privasi**: nama akun, username, URL post media sosial, dan jumlah follower **tidak pernah dibaca** dari database sumber.
- **Tanpa secret di repo**: `.env*` diabaikan git; `.env.example` hanya berisi placeholder.

---

## Struktur kode

```
src/
├── app/
│   ├── (panel)/                  Halaman panel (dilindungi sesi)
│   │   ├── page.tsx              Ringkasan
│   │   ├── media/[type]/         Media Sosial / Media Online
│   │   ├── api-keys/             Kunci API (daftar) · api-keys/new (buat kunci)
│   │   └── docs/                 Dokumentasi API
│   ├── login/                    Halaman login
│   └── api/
│       ├── auth/                 login, logout
│       ├── admin/                media, stats, keys (butuh sesi)
│       └── v1/media/[type]/      API publik (butuh kunci API)
├── components/
│   ├── media/                    Penjelajah media
│   │   ├── MediaBrowser.tsx      Penyusun halaman
│   │   ├── useMediaFilters.ts    State filter + aturan antar-filter
│   │   ├── useMediaFeed.ts       Paging + infinite scroll
│   │   ├── QuickFilters.tsx      Bar filter cepat
│   │   ├── AdvancedFilters.tsx   Drawer filter lanjutan
│   │   ├── StatsBar.tsx          Bar statistik menempel
│   │   ├── ItemCard.tsx          Kartu item
│   │   ├── ItemDetailModal.tsx   Modal detail
│   │   ├── itemParts.tsx         Bagian kecil kartu/modal (badge, metrik, skor, faktor)
│   │   ├── Masonry.tsx           Kolom masonry
│   │   └── controls.tsx          Kontrol form bertema gelap
│   ├── Overview.tsx              Halaman Ringkasan
│   ├── Shell.tsx                 Topbar & tata letak
│   ├── apiKeys/                  Daftar kunci (ApiKeyList) dan halaman buat kunci (CreateApiKey)
│   ├── ApiDocs.tsx
│   └── Logo.tsx
├── lib/
│   ├── media/                    Dipakai client & server
│   │   ├── types.ts              MediaItem, Analysis, MediaType, …
│   │   ├── labels.ts             Label tampilan & format angka
│   │   ├── mood.ts               Label & warna emosi/sentimen
│   │   └── filters.ts            State filter ↔ query string, preset tanggal
│   ├── server/
│   │   ├── bank/                 Akses database sumber
│   │   │   ├── pool.ts           Koneksi read-only
│   │   │   ├── query.ts          Parameter filter → WHERE SQL
│   │   │   ├── items.ts          Daftar item & pemetaan baris
│   │   │   ├── stats.ts          Hitungan, sebaran, volume harian
│   │   │   ├── options.ts        Pilihan filter
│   │   │   └── cache.ts          Cache TTL
│   │   ├── apiKey.ts             Kunci API & pembungkus route publik
│   │   ├── auth.ts               Sesi admin & pembungkus route admin
│   │   └── db.ts                 Prisma client
│   ├── session.ts                JWT sesi (edge-safe, dipakai middleware)
│   ├── api-client.ts / useApi.ts Fetch dari browser
│   └── useDebouncedValue.ts
├── middleware.ts                 Penjaga halaman panel & API admin
└── theme.ts                      Tema Mantine
prisma/
├── schema.prisma                 Admin, ApiKey
└── seed.ts                       Admin pertama
```

### Menambah filter baru

1. **Server** — tambahkan kondisi di `buildWhere` (`lib/server/bank/query.ts`) dan nama parameternya di `FILTER_PARAMS` (agar ikut kunci cache).
2. **Shared** — tambahkan field di `MediaFilters`, `defaultFilters`, `toSearchParams`, dan `countAdvanced` (`lib/media/filters.ts`).
3. **UI** — tambahkan `<Field>` di `AdvancedFilters.tsx`; bila perlu tampil di `StatsBar.tsx`.
4. **Dokumentasi** — `docs/API.md` dan `components/ApiDocs.tsx`.

---

## Konvensi

- Nama di kode (fungsi, variabel, tipe, class CSS) memakai **bahasa Inggris**; teks yang tampil ke pengguna memakai **bahasa Indonesia**.
- Route dan nilai di URL/API juga berbahasa Inggris (`/media/social`, `/api-keys`, `/docs`). URL lama (`/kunci-api`, `/dokumentasi`, `/media/sosial`) dialihkan otomatis, dan API v1 tetap menerima `sosial` sebagai alias `social`.
- Satu komponen = satu file; CSS Modules per komponen. Kontrol dan bagian yang dipakai ulang ada di `controls.tsx` / `itemParts.tsx`.
- Logika domain (aturan filter, pemetaan kolom, label) berada di `lib/`, bukan di komponen.
- Sebelum commit: `npx tsc --noEmit && npm run lint`.

---

## Kategorisasi AI

Setiap kunci API bisa diberi kategorisasi AI: setiap post/berita dalam cakupan kunci mendapat **satu kategori** (atau `none`) yang dikirim lewat API sebagai `classification`, bisa difilter dengan `aiCategory`, dan diringkas di `view=summary`.

1. **Pengaturan AI** (`/settings/ai`) — hubungkan penyedia: Claude (SDK resmi Anthropic), DeepSeek, OpenAI, atau endpoint lain yang kompatibel OpenAI (`/chat/completions`). API key disimpan terenkripsi AES-256-GCM (kunci diturunkan dari `AUTH_SECRET`; mengganti `AUTH_SECRET` berarti API key penyedia harus diisi ulang). Tombol *Uji koneksi* mengirim dua contoh teks.
2. **Per kunci** — saat membuat kunci (`/api-keys/new`) atau dari kartu kunci (`/api-keys/[id]/ai`): pilih penyedia, tulis prompt dan daftar kategori (ada preset **8 Quick Win Kapolri**), dan batas item per hari.
3. **Worker** — proses terpisah `npm run classifier` (PM2 `signalbase-classifier`). Tiap menit, untuk setiap kunci aktif: data baru lebih dulu, lalu mundur ke data lama sampai seluruh cakupan selesai. Item dikirim 20 per permintaan; progres disimpan sebagai cursor sehingga worker bisa dihentikan dan dilanjutkan kapan saja.

Catatan:
- Mengubah prompt, kategori, atau penyedia **menghapus hasil lama** dan mengulang dari awal; menjeda atau mengubah batas harian tidak.
- Claude dipanggil dengan structured output (JSON schema), effort `low`, dan prompt caching untuk instruksi yang sama di setiap batch; model Claude 5.x memakai fallback penolakan sisi server.
- **Biaya:** kira-kira 150–250 token masuk dan 30–40 token keluar per item. Untuk ratusan ribu item, pilih model dan batas harian dengan sadar (mis. Claude Haiku/Sonnet atau DeepSeek jauh lebih murah dari Opus).

## Deploy produksi

Produksi: **https://signalbase.kecup.in** — server bersama, kode di `/var/www/signalbase` (checkout git), PM2 `signalbase-3720` (127.0.0.1:3720), nginx `signalbase.kecup.in` di belakang Cloudflare. `.env` server tidak pernah ditimpa.

Update dari mesin lokal (setelah commit):

```bash
echo 'DEPLOY_HOST=user@host' > .env.deploy   # sekali; diabaikan git
./deploy.sh        # push main, lalu di server: pull, npm ci, prisma db push, build, restart PM2, cek login
```

Pemasangan dari nol:

```bash
npm ci
npx prisma db push
npm run db:seed          # sekali, untuk admin pertama
npm run build
PORT=3100 npm start      # atau lewat PM2: pm2 start "npm start" --name signalbase
npm run classifier       # worker kategorisasi AI (PM2: pm2 start npm --name signalbase-classifier -- run classifier)
```

- Pasang di belakang reverse proxy (nginx) dengan HTTPS; middleware membaca `x-forwarded-host` / `x-forwarded-proto` untuk redirect yang benar.
- Cache berada di memori per proses; menjalankan beberapa instance tetap aman, hanya cache-nya tidak dibagi.
- Jangan menjalankan `next build` di folder yang sama saat server dev berjalan (keduanya memakai `.next`); gunakan `NEXT_DIST_DIR` bila perlu.

---

## Pemecahan masalah

| Gejala | Penyebab & solusi |
|---|---|
| `SOURCE_DATABASE_URL belum diatur` | Isi variabel itu di `.env`, lalu restart server. |
| Total "menghitung…" lama | Hitungan pasti atas jutaan baris bisa 5–20 detik pertama kali; berikutnya dari cache. Persempit rentang tanggal untuk mempercepat. |
| Semua halaman error 500 setelah ubah CSS | Biasanya galat sintaks CSS Module; cek pesan di terminal dev. |
| Kolom baru di Prisma tidak terbaca | Jalankan `npx prisma db push` lalu restart server dev (client Prisma dimuat saat start). |
| API mengembalikan 401 | Kunci salah atau sudah dicabut. |
| Port 3100 dipakai | `PORT=4100 ./run.sh` atau hentikan proses lama. |
