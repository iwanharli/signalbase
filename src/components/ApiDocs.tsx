"use client";
import { useEffect, useState } from "react";
import { CopyButton, Tooltip } from "@mantine/core";
import {
  IconAlertTriangle, IconBolt, IconCheck, IconCopy, IconKey, IconListDetails, IconLock, IconRoute, IconShieldLock, IconTable, IconTag,
} from "@tabler/icons-react";
import classes from "./apiDocs.module.css";

// ── Content ────────────────────────────────────────────────────────────────────

type Scope = "all" | "social" | "online";
type Param = { name: string; values: string; description: string; scope?: Scope };

const PARAM_GROUPS: { title: string; params: Param[] }[] = [
  {
    title: "Halaman & urutan",
    params: [
      { name: "page", values: "angka ≥ 1", description: "Nomor halaman (default 1)" },
      { name: "size", values: "1–100", description: "Item per halaman (default 24)" },
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
      { name: "analyzed", values: "yes | no", description: "Hanya yang sudah / belum punya label emosi atau sentimen" },
      { name: "lang", values: "id | other", description: "Hanya bahasa Indonesia / selain Indonesia" },
      { name: "province", values: "kode BPS", description: "Mis. 31 DKI Jakarta, 32 Jawa Barat, 35 Jawa Timur" },
      { name: "category", values: "teks", description: "Kategori, mis. politik, hukum, kamtibmas" },
    ],
  },
  {
    title: "Khusus jenis media",
    params: [
      { name: "relevance", values: "relevant | include | watchlist | exclude", description: "Penilaian relevansi AI; relevant = semua kecuali exclude", scope: "social" },
      { name: "postType", values: "post | reply | quote | repost", description: "Jenis post", scope: "social" },
      { name: "level", values: "1–5", description: "Intensitas emosi minimal", scope: "social" },
      { name: "image", values: "yes", description: "Hanya berita bergambar", scope: "online" },
    ],
  },
];

const FIELDS: [string, string, string][] = [
  ["id", "string", "Kode unik item"],
  ["type", "social | online", "Jenis media"],
  ["source", "string", "Platform atau kode media"],
  ["title", "string | null", "Judul (berita)"],
  ["content", "string | null", "Isi post / cuplikan berita"],
  ["url", "string | null", "Tautan berita; selalu null untuk media sosial"],
  ["image", "string | null", "Gambar berita"],
  ["publishedAt", "ISO 8601", "Waktu terbit (UTC)"],
  ["category · province · location", "string | null", "Kategori, nama provinsi, lokasi yang disebut"],
  ["mood · moodLevel", "string · 1–5", "Emosi/sentimen dan intensitasnya"],
  ["metrics", "objek", "likes, comments, shares, views (null bila tidak tersedia)"],
  ["analysis", "objek | null", "summary, target, score, signals, topics, factors, relevance"],
];

const ERRORS: [number, string, string][] = [
  [200, "OK", "Berhasil"],
  [401, "Unauthorized", "Kunci tidak ada, salah, atau sudah dicabut"],
  [404, "Not Found", "Jenis bukan social / online"],
  [502, "Bad Gateway", "Sumber data tidak bisa dihubungi"],
];

const LIST_RESPONSE = `{
  "page": 1, "pages": 27, "size": 24,
  "total": 642, "capped": false,
  "items": [{
    "id": "6e6968b9df9fe6f94c18ac371488142a",
    "type": "online",
    "source": "news-kompas",
    "title": "…", "content": "…",
    "url": "https://…", "image": "https://…",
    "category": "hukum", "province": "Jawa Timur",
    "publishedAt": "2026-11-06T02:38:00.000Z",
    "mood": "negative", "moodLevel": null,
    "metrics": { "likes": null, "comments": null, "shares": null, "views": null },
    "analysis": { "summary": null, "topics": ["hukum"], "relevance": null, … }
  }]
}`;

const SUMMARY_RESPONSE = `{
  "total": 2192, "capped": false,
  "moods": [
    { "value": "netral",  "n": 370 },
    { "value": "menolak", "n": 224 },
    { "value": "marah",   "n": 112 }
  ]
}`;

const SECTIONS = [
  { id: "quickstart", label: "Mulai cepat", icon: IconBolt },
  { id: "auth", label: "Autentikasi", icon: IconLock },
  { id: "endpoints", label: "Endpoint", icon: IconRoute },
  { id: "params", label: "Parameter", icon: IconListDetails },
  { id: "fields", label: "Objek item", icon: IconTable },
  { id: "errors", label: "Kode status", icon: IconAlertTriangle },
  { id: "privacy", label: "Privasi & batas", icon: IconShieldLock },
];

// ── Building blocks ────────────────────────────────────────────────────────────

/** The panel's own origin, so examples can be pasted as-is. */
function useOrigin() {
  const [origin, setOrigin] = useState("https://<host>");
  useEffect(() => setOrigin(window.location.origin), []);
  return origin;
}

function Copy({ value, label = "Salin" }: { value: string; label?: string }) {
  return (
    <CopyButton value={value} timeout={1600}>
      {({ copied, copy }) => (
        <Tooltip label={copied ? "Tersalin" : label} withArrow position="left">
          <button type="button" className={classes.copy} data-copied={copied || undefined} onClick={copy} aria-label={label}>
            {copied ? <IconCheck size={15} /> : <IconCopy size={15} />}
          </button>
        </Tooltip>
      )}
    </CopyButton>
  );
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  return (
    <div className={classes.code}>
      <div className={classes.codeBar}><span>{language}</span><Copy value={code} /></div>
      <pre>{code}</pre>
    </div>
  );
}

function Section({ id, icon: Icon, title, lead, children }: { id: string; icon: typeof IconBolt; title: string; lead?: string; children: React.ReactNode }) {
  return (
    <section id={id} className={classes.section}>
      <h2><span><Icon size={17} /></span>{title}</h2>
      {lead && <p className={classes.lead}>{lead}</p>}
      {children}
    </section>
  );
}

function ScopeBadge({ scope }: { scope?: Scope }) {
  if (!scope || scope === "all") return <span className={classes.scope}>semua</span>;
  return <span className={classes.scope} data-scope={scope}>{scope}</span>;
}

/** Highlights the section currently in view in the side navigation. */
function useActiveSection() {
  const [active, setActive] = useState(SECTIONS[0].id);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) setActive(e.target.id); }),
      { rootMargin: "-30% 0px -60% 0px" },
    );
    SECTIONS.forEach((s) => { const el = document.getElementById(s.id); if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, []);
  return active;
}

// ── Page ───────────────────────────────────────────────────────────────────────

export function ApiDocs() {
  const origin = useOrigin();
  const active = useActiveSection();
  const endpoint = `${origin}/api/v1/media`;
  const listExample = `curl -H "Authorization: Bearer $SIGNALBASE_KEY" \\\n  "${endpoint}/online?from=2026-11-01&mood=negative&size=50"`;
  const summaryExample = `curl -H "x-api-key: $SIGNALBASE_KEY" \\\n  "${endpoint}/social?view=summary&from=2026-10-31"`;
  const fetchExample = `const res = await fetch("${endpoint}/social?relevance=relevant&level=4", {
  headers: { Authorization: \`Bearer \${process.env.SIGNALBASE_KEY}\` },
});
if (!res.ok) throw new Error((await res.json()).error);
const { items, total, capped } = await res.json();`;

  return (
    <div className={classes.page}>
      <header className={classes.hero}>
        <div className={classes.heroGrid} aria-hidden />
        <div className={classes.heroBody}>
          <span className={classes.version}>REST · JSON · v1</span>
          <h1>API <em>Signalbase</em></h1>
          <p>Baca post media sosial dan berita online dari bank data, lengkap dengan analisis AI. Setiap kunci hanya melihat data yang sesuai kata kuncinya.</p>
          <div className={classes.baseUrl}>
            <span className={classes.method}>GET</span>
            <code>{endpoint}/<b>{"{social|online}"}</b></code>
            <Copy value={`${endpoint}/`} label="Salin URL" />
          </div>
        </div>
      </header>

      <div className={classes.layout}>
        <nav className={classes.toc} aria-label="Isi dokumentasi">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} data-active={active === s.id || undefined}><s.icon size={15} />{s.label}</a>
          ))}
        </nav>

        <div className={classes.content}>
          <Section id="quickstart" icon={IconBolt} title="Mulai cepat">
            <ol className={classes.steps}>
              <li><b>Buat kunci</b><span>Di halaman Kunci API, beri nama aplikasi dan kata kunci (mis. polri, polisi). Salin kuncinya, hanya muncul sekali.</span></li>
              <li><b>Simpan sebagai secret</b><span>Taruh di variabel lingkungan aplikasi, mis. <code>SIGNALBASE_KEY</code>. Jangan commit ke repo.</span></li>
              <li><b>Panggil endpoint</b><span>Kirim kunci di header setiap permintaan, lalu baca <code>items</code> dari respons.</span></li>
            </ol>
            <CodeBlock language="bash" code={listExample} />
          </Section>

          <Section id="auth" icon={IconLock} title="Autentikasi" lead="Kirim kunci lewat salah satu header berikut. Kunci yang salah atau sudah dicabut mendapat 401.">
            <CodeBlock language="http" code={"Authorization: Bearer sb_xxxxxxxxxxxxxxxx\n# atau\nx-api-key: sb_xxxxxxxxxxxxxxxx"} />
            <div className={classes.callout}>
              <IconTag size={18} />
              <div>
                <b>Cakupan kata kunci</b>
                <p>Respons hanya berisi item yang menyebut salah satu kata kunci milik kunci tersebut (isi post untuk media sosial, judul untuk berita). Frasa multi-kata dicocokkan utuh, dan &ldquo;polisi tidur&rdquo; tidak dihitung sebagai &ldquo;polisi&rdquo;. Kunci tanpa kata kunci membaca seluruh bank. Cakupan ini tidak bisa dilewati lewat parameter.</p>
              </div>
            </div>
          </Section>

          <Section id="endpoints" icon={IconRoute} title="Endpoint">
            <article className={classes.endpoint}>
              <header><span className={classes.method}>GET</span><code>/api/v1/media/{"{social|online}"}</code></header>
              <p>Daftar item terpaginasi, terbaru lebih dulu. Menerima semua parameter filter.</p>
              <div className={classes.split}>
                <CodeBlock language="bash" code={listExample} />
                <CodeBlock language="json · 200" code={LIST_RESPONSE} />
              </div>
              <p className={classes.note}><code>total</code> dihitung paling banyak 10.000 agar setiap permintaan cepat; <code>capped: true</code> berarti jumlah sebenarnya lebih dari itu.</p>
            </article>

            <article className={classes.endpoint}>
              <header><span className={classes.method}>GET</span><code>/api/v1/media/{"{social|online}"}<b>?view=summary</b></code></header>
              <p>Total dan sebaran emosi (social) atau sentimen (online) untuk filter yang sama.</p>
              <div className={classes.split}>
                <CodeBlock language="bash" code={summaryExample} />
                <CodeBlock language="json · 200" code={SUMMARY_RESPONSE} />
              </div>
              <p className={classes.note}>Sebaran dihitung dari 10.000 item terbaru yang cocok dan mengabaikan filter <code>mood</code> agar semua bagian tetap terlihat; <code>total</code> tetap mengikutinya.</p>
            </article>

            <CodeBlock language="typescript" code={fetchExample} />
          </Section>

          <Section id="params" icon={IconListDetails} title="Parameter" lead="Semua parameter opsional dan bisa digabung. Parameter yang tidak dikirim tidak menyaring apa pun.">
            {PARAM_GROUPS.map((group) => (
              <div key={group.title} className={classes.tableWrap}>
                <h3>{group.title}</h3>
                <table className={classes.table}>
                  <thead><tr><th>Parameter</th><th>Nilai</th><th>Keterangan</th><th>Berlaku</th></tr></thead>
                  <tbody>
                    {group.params.map((p) => (
                      <tr key={p.name}>
                        <td><code className={classes.param}>{p.name}</code></td>
                        <td className={classes.values}>{p.values}</td>
                        <td>{p.description}</td>
                        <td><ScopeBadge scope={p.scope} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </Section>

          <Section id="fields" icon={IconTable} title="Objek item" lead="Setiap elemen di items. Field yang tidak tersedia untuk jenis media tertentu bernilai null atau array kosong.">
            <div className={classes.tableWrap}>
              <table className={classes.table}>
                <thead><tr><th>Field</th><th>Tipe</th><th>Keterangan</th></tr></thead>
                <tbody>
                  {FIELDS.map(([name, type, description]) => (
                    <tr key={name}><td><code className={classes.param}>{name}</code></td><td className={classes.values}>{type}</td><td>{description}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section id="errors" icon={IconAlertTriangle} title="Kode status" lead='Galat dikembalikan sebagai JSON: { "error": "pesan" }.'>
            <div className={classes.statuses}>
              {ERRORS.map(([code, name, description]) => (
                <div key={code} className={classes.status} data-ok={code < 300 || undefined}>
                  <b>{code}</b><span>{name}</span><p>{description}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section id="privacy" icon={IconShieldLock} title="Privasi & batas">
            <ul className={classes.facts}>
              <li><IconShieldLock size={16} />Nama akun, username, URL post media sosial, dan jumlah follower tidak pernah dikirim.</li>
              <li><IconKey size={16} />Kunci hanya disimpan sebagai hash; cabut kapan saja dari halaman Kunci API.</li>
              <li><IconBolt size={16} />Hitungan di-cache sekitar 2 menit per kombinasi filter; data baru bisa muncul dengan jeda tersebut.</li>
              <li><IconTable size={16} />Post spam dan item bertanggal tidak wajar (sebelum 2010 atau di masa depan) selalu disembunyikan.</li>
            </ul>
          </Section>
        </div>
      </div>
    </div>
  );
}
