# Signalbase API v1

API baca untuk aplikasi lain (mis. KIPERMAS). Semua respons berupa JSON.

- [Autentikasi](#autentikasi)
- [Cakupan kata kunci](#cakupan-kata-kunci)
- [Daftar item](#daftar-item)
- [Ringkasan](#ringkasan)
- [Parameter filter](#parameter-filter)
- [Objek item](#objek-item)
- [Kode status & galat](#kode-status--galat)
- [Contoh](#contoh)

---

## Autentikasi

Buat kunci di panel → **Kunci API**. Kunci (`sb_…`) hanya ditampilkan sekali; simpan di secret manager aplikasi Anda, bukan di repo.

Kirim di setiap permintaan, salah satu:

```
Authorization: Bearer sb_xxxxxxxxxxxxxxxx
x-api-key: sb_xxxxxxxxxxxxxxxx
```

Kunci yang salah atau sudah dicabut → `401`.

## Cakupan kata kunci

Setiap kunci punya daftar kata kunci (diatur saat dibuat). Respons hanya berisi item yang **menyebut salah satu kata kunci** itu:

- Dicocokkan dengan pencarian teks penuh Postgres (`simple`), tidak peka huruf besar/kecil.
- Media sosial dicocokkan pada isi post; media online pada judul berita.
- Kata kunci multi-kata (mis. `polda metro`) dicocokkan sebagai frasa.
- `polisi` tidak cocok dengan frasa "polisi tidur".
- Kunci **tanpa** kata kunci membaca seluruh bank.

Selain kata kunci, kunci bisa diberi **parameter cakupan tetap** saat dibuat:

| Parameter | Efek |
|---|---|
| Jenis media | Hanya `social` atau hanya `online`. Jenis lain → `403`. |
| Status analisis | Hanya item yang sudah punya label emosi/sentimen. |
| Relevansi AI | Hanya relevan / include / watchlist (media sosial). |
| Bahasa | Hanya Indonesia, atau hanya bahasa lain. |
| Provinsi | Satu atau beberapa provinsi. |
| Kategori | Satu atau beberapa kategori. |
| Intensitas emosi min. | Hanya emosi dengan intensitas ≥ nilai (media sosial). |

Cakupan berlaku untuk daftar item maupun ringkasan dan diterapkan **di atas** parameter permintaan: aplikasi masih bisa mempersempit hasil lewat parameter filter, tetapi tidak bisa melewati batas kunci (mis. kunci khusus Jawa Barat yang meminta `province=31` mendapat hasil kosong).

---

## Daftar item

```
GET /api/v1/media/{type}
```

`type`: `social` (post media sosial) atau `online` (berita online).

| Parameter | Nilai | Default | Keterangan |
|---|---|---|---|
| `page` | angka ≥ 1 | 1 | Halaman |
| `size` | 1–100 | 24 | Item per halaman |
| `sort` | `newest` \| `oldest` | `newest` | Urutan waktu terbit |

Ditambah semua [parameter filter](#parameter-filter).

Respons:

```json
{
  "page": 1,
  "pages": 27,
  "size": 24,
  "total": 642,
  "capped": false,
  "items": [ /* objek item */ ]
}
```

- `total` dihitung **maksimal 10.000** agar setiap permintaan cepat. Bila `capped` bernilai `true`, jumlah sebenarnya ≥ 10.000 dan `pages` dihitung dari 10.000.
- `page` di luar jangkauan dikembalikan ke halaman terakhir yang ada.

## Ringkasan

```
GET /api/v1/media/{type}?view=summary
```

Menerima parameter filter yang sama.

```json
{
  "total": 2175,
  "capped": false,
  "moods": [
    { "value": "netral", "n": 358 },
    { "value": "menolak", "n": 224 },
    { "value": "marah", "n": 109 }
  ]
}
```

- `moods`: jumlah per emosi (social) atau sentimen (online), dari 10.000 item terbaru yang cocok, urut terbanyak.
- `moods` **mengabaikan** filter `mood` agar semua bagian tetap terlihat; `total` tetap mengikutinya.

---

## Parameter filter

| Parameter | Nilai | Berlaku | Keterangan |
|---|---|---|---|
| `from`, `to` | `YYYY-MM-DD` | semua | Rentang tanggal terbit, inklusif |
| `q` | teks (≤ 200) | semua | Pencarian teks penuh (isi post / judul berita) |
| `source` | teks | semua | Platform (`twitter`, `threads`, `youtube`, …) atau kode media (`news-kompas`, …) |
| `mood` | teks | semua | Emosi (`marah`, `menolak`, `netral`, `mendukung`, `puas`, …) atau sentimen (`positive`, `neutral`, `negative`) |
| `analyzed` | `yes` \| `no` | semua | Hanya yang sudah / belum punya label emosi atau sentimen |
| `lang` | `id` \| `other` | semua | Hanya bahasa Indonesia / selain Indonesia |
| `province` | kode BPS | semua | Mis. `31` DKI Jakarta, `32` Jawa Barat, `35` Jawa Timur |
| `category` | teks | semua | Kategori, mis. `politik`, `hukum`, `kamtibmas` |
| `relevance` | `relevant` \| `include` \| `watchlist` \| `exclude` | social | Penilaian relevansi AI. `relevant` = semua kecuali `exclude` |
| `postType` | `post` \| `reply` \| `quote` \| `repost` | social | Jenis post |
| `level` | 1–5 | social | Intensitas emosi minimal |
| `image` | `yes` | online | Hanya berita bergambar |

Parameter yang tidak dikirim tidak menyaring apa pun. Post bertipe `spam` dan item dengan tanggal tidak wajar (sebelum 2010 atau di masa depan) selalu disembunyikan.

---

## Objek item

```json
{
  "id": "6e6968b9df9fe6f94c18ac371488142a",
  "type": "online",
  "source": "news-kompas",
  "title": "…",
  "content": "…",
  "url": "https://…",
  "image": "https://…",
  "postType": null,
  "category": "hukum",
  "province": "Jawa Timur",
  "location": null,
  "publishedAt": "2026-11-06T02:38:00.000Z",
  "mood": "negative",
  "moodLevel": null,
  "metrics": { "likes": null, "comments": null, "shares": null, "views": null },
  "analysis": {
    "summary": null,
    "target": null,
    "score": null,
    "signals": [],
    "topics": ["hukum"],
    "factors": null,
    "relevance": null
  }
}
```

| Field | Tipe | Keterangan |
|---|---|---|
| `id` | string | Kode unik di database sumber |
| `type` | `social` \| `online` | |
| `source` | string | Platform atau kode media |
| `title` | string \| null | Judul (hanya berita) |
| `content` | string \| null | Isi post / cuplikan berita |
| `url` | string \| null | Tautan berita. **Selalu null untuk media sosial** (privasi) |
| `image` | string \| null | Gambar berita (http/https saja) |
| `postType` | string \| null | Jenis post (social) |
| `category` | string \| null | Kategori |
| `province` | string \| null | Nama provinsi |
| `location` | string \| null | Lokasi yang disebut (social) |
| `publishedAt` | ISO 8601 | Waktu terbit (UTC) |
| `mood` | string \| null | Emosi (social) / sentimen (online), huruf kecil |
| `moodLevel` | 1–5 \| null | Intensitas emosi (social) |
| `metrics` | objek | `likes`, `comments`, `shares`, `views`; null bila platform tidak menyediakan |
| `analysis` | objek \| null | null bila item belum dianalisis |
| `analysis.summary` | string \| null | Ringkasan/alasan AI (social) |
| `analysis.target` | string \| null | Sasaran emosi, mis. "pemerintah" (social) |
| `analysis.score` | number \| null | Skor emosi, negatif ↔ positif, kira-kira −3…+3 (social) |
| `analysis.signals` | string[] | Penanda isi, mis. `sarkasme`, `lokasi`, `waktu` (social) |
| `analysis.topics` | string[] | Topik berita (online) |
| `analysis.factors` | objek \| null | Skor 1–5: `jenis`, `korban`, `pelaku`, `kerugian`, `intensitas` (social) |
| `analysis.relevance` | `include` \| `watchlist` \| `exclude` \| null | Penilaian relevansi AI (social) |

Nama akun, username, dan jumlah follower **tidak pernah** dikirim.

---

## Kategorisasi AI

Kunci yang memakai **kategorisasi AI** (diatur admin di panel) mendapat tambahan berikut. Kunci lain tidak berubah.

**Setiap item** membawa `classification` (atau `null` bila belum diproses):

```json
"classification": { "category": "QW3", "label": "Bersih Judi Daring dan Penipuan Digital", "confidence": 0.86, "reason": "Melaporkan penangkapan admin situs judi online" }
```

`category` adalah salah satu kode kategori milik kunci, atau `none` bila tidak cocok dengan kategori mana pun.

**Filter per kategori:** `?aiCategory=QW3` mengembalikan item berkategori itu, terbaru lebih dulu. Pada mode ini hanya `from`, `to`, `sort`, `page`, dan `size` yang berlaku; filter lain diabaikan. `total` di sini adalah jumlah pasti item yang sudah dikategorikan.

**Ringkasan** (`view=summary`) menambahkan `aiCategories`:

```json
"aiCategories": [{ "code": "QW1", "label": "Ruang Publik Aman", "n": 1240 }, …, { "code": "none", "label": "Tidak termasuk", "n": 5120 }]
```

Kategorisasi berjalan di background (data baru lebih dulu, lalu mundur ke data lama) dengan batas harian, jadi item terbaru bisa butuh beberapa menit sampai mendapat `classification`.

## Kode status & galat

| Status | Arti |
|---|---|
| `200` | Berhasil |
| `401` | Kunci tidak ada, salah, atau dicabut — `{ "error": "Kunci API tidak valid" }` |
| `400` | `aiCategory` dipakai pada kunci tanpa kategorisasi AI |
| `403` | Kunci tidak punya akses ke jenis media yang diminta |
| `404` | `type` bukan `social`/`online` |
| `502` | Sumber data tidak bisa dihubungi — `{ "error": "Sumber data tidak bisa dihubungi" }` |

Hasil hitungan di-cache ±2 menit per kombinasi filter; data baru bisa muncul dengan jeda tersebut pada `total`.

---

## Contoh

Berita negatif sejak 1 November, 50 per halaman:

```bash
curl -H "Authorization: Bearer $SIGNALBASE_KEY" \
  "https://<host>/api/v1/media/online?from=2026-11-01&mood=negative&size=50"
```

Post relevan berintensitas tinggi di DKI Jakarta:

```bash
curl -H "x-api-key: $SIGNALBASE_KEY" \
  "https://<host>/api/v1/media/social?relevance=relevant&level=4&province=31"
```

Sebaran emosi 7 hari terakhir:

```bash
curl -H "x-api-key: $SIGNALBASE_KEY" \
  "https://<host>/api/v1/media/social?view=summary&from=2026-10-31"
```

TypeScript:

```ts
const res = await fetch(`${process.env.SIGNALBASE_URL}/api/v1/media/online?size=50&from=2026-11-01`, {
  headers: { Authorization: `Bearer ${process.env.SIGNALBASE_KEY}` },
});
if (!res.ok) throw new Error((await res.json()).error);
const { items, total, capped } = await res.json();
```
