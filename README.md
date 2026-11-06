# Signalbase

Bank data media: kurasi post media sosial dan berita online tentang kepolisian sebelum dipakai aplikasi lain (mis. KIPERMAS).

```
bankkomen (sumber, hanya baca) ──▶ Signalbase: antrean → setujui/tolak, koreksi label ──▶ /api/v1 (kunci API) ──▶ KIPERMAS
```

- **Sumber**: database bankkomen (`post_main`, `news_main`, `post_analyses`, `news_analyses`), dibaca read-only dan disaring ke konten yang menyebut kepolisian.
- **Kurasi**: antrean per jenis media; setujui/tolak satu per satu atau massal; label emosi (sosial) / sentimen (online) bisa dikoreksi.
- **Snapshot**: item yang ditinjau disimpan utuh di database Signalbase, jadi pembaca API tidak bergantung pada bankkomen.
- **API**: `GET /api/v1/media/{sosial|online}` hanya mengembalikan item yang disetujui. Detail di halaman *Dokumentasi API*.
- **Privasi**: tidak menyimpan nama akun, penulis, atau tautan balik post media sosial.

## Menjalankan

```bash
cp .env.example .env      # isi DATABASE_URL, BANKKOMEN_DATABASE_URL, AUTH_SECRET, ADMIN_*
createdb signalbase
npm install
npx prisma db push && npm run db:seed
./run.sh                  # atau: npm run dev → http://localhost:3100
```

Stack: Next.js 15, PostgreSQL + Prisma, Mantine 7.
