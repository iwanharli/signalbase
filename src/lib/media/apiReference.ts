// Reference for the public API (/api/v1/media/{social|online}), shared by the panel's documentation (/docs)
// and the public Integrasi page, so both always describe the same thing. Keep in sync with
// src/app/api/v1/media/[type]/route.ts and src/lib/server/bank/items.ts (toItem).

export type Scope = "all" | "social" | "online";
export type Param = { name: string; values: string; description: string; scope?: Scope };

export const API_PATH = "/api/v1/media";
export const MAX_PAGE_SIZE = 100;

/** The calls one key can make. `query` is appended to /api/v1/media/{type}. */
export const ENDPOINTS: { name: string; query: string; description: string; needsAi?: boolean }[] = [
  { name: "Daftar konten", query: "?from=2026-11-01&mood=negative&size=50", description: "Post atau berita dalam cakupan kunci, terbaru dulu, dengan semua filter di bawah. Setiap item membawa analisis, pembuat, dan keyword yang cocok." },
  { name: "Ringkasan", query: "?view=summary&from=2026-11-01", description: "Total item dan sebaran emosi / sentimen untuk filter yang sama, plus sebaran kategori AI bila aktif." },
  { name: "Pilihan filter", query: "?view=options", description: "Daftar sumber, emosi, provinsi, dan jenis post yang tersedia, untuk mengisi dropdown di aplikasi Anda." },
  { name: "Satu kategori AI", query: "?aiCategory=QW3&size=50", description: "Item yang diberi label pada satu kategori AI milik kunci Anda.", needsAi: true },
  { name: "Tren kategori", query: "?view=trend&interval=week&from=2026-10-01", description: "Jumlah item per minggu atau per hari untuk setiap kategori AI.", needsAi: true },
];

export const PARAM_GROUPS: { title: string; params: Param[] }[] = [
  {
    title: "Halaman & urutan",
    params: [
      { name: "page", values: "angka ≥ 1", description: "Nomor halaman (default 1)" },
      { name: "size", values: `1–${MAX_PAGE_SIZE}`, description: "Item per halaman (default 24)" },
      { name: "sort", values: "newest | oldest", description: "Urutan waktu terbit (default newest)" },
    ],
  },
  {
    title: "Filter umum",
    params: [
      { name: "from, to", values: "YYYY-MM-DD", description: "Rentang tanggal terbit, inklusif" },
      { name: "q", values: "teks", description: "Pencarian teks penuh di isi post / judul berita" },
      { name: "source", values: "teks", description: "Platform (twitter, threads, …) atau kode media (news-kompas, …)" },
      { name: "mood", values: "teks", description: "Emosi (marah, menolak, …) atau sentimen (positive, neutral, negative)" },
      { name: "analyzed", values: "yes | no", description: "Hanya yang memiliki / belum memiliki label emosi atau sentimen" },
      { name: "lang", values: "id | other", description: "Hanya bahasa Indonesia / selain Indonesia" },
      { name: "province", values: "kode BPS", description: "Mis. 31 DKI Jakarta, 32 Jawa Barat, 35 Jawa Timur" },
      { name: "category", values: "teks", description: "Kategori, mis. politik, hukum, kamtibmas" },
    ],
  },
  {
    title: "Khusus jenis media",
    params: [
      { name: "relevance", values: "relevant | include | watchlist | exclude", description: "Penilaian relevansi; relevant = semua kecuali exclude", scope: "social" },
      { name: "postType", values: "post | reply | quote | repost", description: "Jenis post", scope: "social" },
      { name: "level", values: "1–5", description: "Intensitas emosi minimal", scope: "social" },
      { name: "image", values: "yes", description: "Hanya berita bergambar", scope: "online" },
    ],
  },
  {
    title: "Kategorisasi AI (kunci dengan AI aktif)",
    params: [
      { name: "aiCategory", values: "kode, mis. QW3", description: "Item dalam satu kategori AI. Hanya from, to, sort, page, size yang berlaku bersama parameter ini." },
    ],
  },
];

export const FIELDS: [string, string, string][] = [
  ["id", "string", "Kode unik item"],
  ["type", "social | online", "Jenis media"],
  ["source", "string", "Platform atau kode media"],
  ["title", "string | null", "Judul (berita)"],
  ["content · body", "string | null", "Isi post / cuplikan berita; body = isi berita lengkap bila tersedia"],
  ["url", "string | null", "Tautan berita atau post asli"],
  ["image", "string | null", "Gambar berita / post"],
  ["publishedAt", "ISO 8601", "Waktu terbit (UTC)"],
  ["author", "objek | null", "Pembuat: name, username, profileUrl, accountType, followers, following"],
  ["language", "string | null", "Bahasa sumber (id, en, …)"],
  ["category · province · city · location", "string | null", "Kategori, provinsi, kota, dan lokasi yang disebut"],
  ["mood · moodLevel", "string · 1–5", "Emosi/sentimen dan intensitasnya"],
  ["metrics", "objek", "likes, comments, shares, views (null bila tidak tersedia)"],
  ["analysis", "objek | null", "summary, target, score, signals, topics, factors, relevance"],
  ["matchedKeywords", "string[]", "Keyword kunci Anda yang disebut item ini"],
  ["classification", "objek | null", "Hanya untuk kunci dengan kategorisasi AI: category, label, confidence, reason"],
];

export const ERRORS: [number, string, string][] = [
  [200, "OK", "Berhasil"],
  [400, "Bad Request", "Parameter khusus AI dipakai pada kunci tanpa kategorisasi AI"],
  [401, "Unauthorized", "Kunci tidak ada, salah, atau sudah dicabut"],
  [403, "Forbidden", "Kunci tidak punya akses ke jenis media ini, atau akun pemilik kunci tidak aktif"],
  [404, "Not Found", "Jenis bukan social / online"],
  [503, "Service Unavailable", "Sumber data sibuk atau permintaan terlalu berat; coba lagi (lihat header Retry-After) atau persempit filter"],
];

export const LIST_RESPONSE = `{
  "page": 1, "pages": 27, "size": 24,
  "total": 642, "capped": false,
  "items": [{
    "id": "b1c7…",
    "type": "social",
    "source": "twitter",
    "content": "Lapor lewat aplikasi pengaduan, besoknya langsung ditindaklanjuti…",
    "url": "https://x.com/…/status/…",
    "publishedAt": "2026-11-06T02:38:00.000Z",
    "author": { "name": "Rina Kusuma", "username": "rinakusuma", "followers": 1840 },
    "language": "id", "province": "Jawa Timur",
    "mood": "mendukung", "moodLevel": 3,
    "metrics": { "likes": 128, "comments": 24, "shares": 41, "views": null },
    "analysis": { "summary": "Apresiasi kecepatan layanan", "relevance": "include", … },
    "matchedKeywords": ["pelayanan publik"],
    "classification": { "category": "layanan_publik", "label": "Pelayanan publik", "confidence": 0.92 }
  }]
}`;

export const SUMMARY_RESPONSE = `{
  "total": 2192, "capped": false,
  "moods": [
    { "value": "netral",  "n": 370 },
    { "value": "menolak", "n": 224 },
    { "value": "marah",   "n": 112 }
  ]
}`;

/** Ready-to-paste examples for the list call. `origin` is the site's own address. */
export function codeSamples(origin: string) {
  const url = `${origin}${API_PATH}/social?from=2026-11-01&mood=negative&size=50`;
  return [
    { id: "curl", label: "cURL", code: `curl "${url}" \\\n  -H "x-api-key: $SIGNALBASE_KEY"` },
    {
      id: "js", label: "JavaScript",
      code: `const res = await fetch("${url}", {\n  headers: { "x-api-key": process.env.SIGNALBASE_KEY },\n});\nif (!res.ok) throw new Error((await res.json()).error);\nconst { items, total } = await res.json();\nconsole.log(total, items[0]?.content);`,
    },
    {
      id: "python", label: "Python",
      code: `import os, requests\n\nres = requests.get(\n    "${origin}${API_PATH}/social",\n    params={"from": "2026-11-01", "mood": "negative", "size": 50},\n    headers={"x-api-key": os.environ["SIGNALBASE_KEY"]},\n    timeout=30,\n)\nres.raise_for_status()\nfor item in res.json()["items"]:\n    print(item["publishedAt"], item["mood"], item["content"][:80])`,
    },
    {
      id: "php", label: "PHP",
      code: `<?php\n$ch = curl_init("${url}");\ncurl_setopt_array($ch, [\n  CURLOPT_RETURNTRANSFER => true,\n  CURLOPT_HTTPHEADER => ["x-api-key: " . getenv("SIGNALBASE_KEY")],\n]);\n$data = json_decode(curl_exec($ch), true);\nforeach ($data["items"] as $item) {\n  echo $item["mood"] . " — " . $item["content"] . PHP_EOL;\n}`,
    },
  ];
}
