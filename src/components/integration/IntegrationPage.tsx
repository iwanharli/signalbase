// Public Integrasi page (/integrasi): everything a developer needs to judge and start with the API.
// Endpoints, parameters, fields and errors come from src/lib/media/apiReference.ts, shared with the panel docs.
import Link from "next/link";
import {
  IconAlertTriangle, IconArrowUpRight, IconBellRinging, IconBolt, IconChartBar, IconCheck, IconDatabase, IconKey, IconListDetails,
  IconLock, IconPlugConnected, IconRoute, IconShieldCheck, IconSparkles, IconTable, IconUserCheck,
} from "@tabler/icons-react";
import { API_PATH, codeSamples, ENDPOINTS, ERRORS, FIELDS, LIST_RESPONSE, MAX_PAGE_SIZE, PARAM_GROUPS } from "@/lib/media/apiReference";
import { SITE_URL } from "../landing/content";
import { PageHeader } from "../landing/decor";
import { Cta } from "../landing/sections";
import landing from "../landing/landing.module.css";
import { COMPARISON, COMPARISON_COLUMNS } from "../pricing/plans";
import { CodeTabs } from "./CodeTabs";
import c from "./integration.module.css";

const reveal = (cls: string) => `${cls} ${landing.reveal}`;

const FACTS: [string, string][] = [
  ["Base URL", `${SITE_URL}${API_PATH}`],
  ["Autentikasi", "x-api-key atau Bearer"],
  ["Format", "JSON · UTF-8"],
  ["Jenis media", "social · online"],
  ["Per halaman", `hingga ${MAX_PAGE_SIZE} item`],
];

const QUICKSTART = [
  { icon: IconUserCheck, title: "Daftar & disetujui", text: "Buat akun. Setelah admin menyetujui, trial dimulai." },
  { icon: IconKey, title: "Buat proyek", text: "Pilih keyword, jenis media, dan cakupan wilayah untuk aplikasi Anda." },
  { icon: IconLock, title: "Simpan di server", text: "Taruh kunci API proyek di variabel lingkungan backend, bukan di browser." },
  { icon: IconBolt, title: "Panggil API", text: "Kirim permintaan pertama dan terima JSON dalam hitungan detik." },
];

const USES = [
  { icon: IconChartBar, title: "Dashboard internal", text: "Tampilkan tren, emosi, dan post terbaru tentang isu Anda di dashboard tim atau layar ruang kendali.", flow: ["Signalbase", "Backend", "Dashboard"] },
  { icon: IconBellRinging, title: "Peringatan isu", text: "Periksa API berkala; kirim notifikasi ke Slack, email, atau WhatsApp saat muncul lonjakan post negatif.", flow: ["Signalbase", "Penjadwal", "Notifikasi"] },
  { icon: IconDatabase, title: "Sinkronisasi data & BI", text: "Salin item baru ke database atau gudang data, lalu analisis di Looker, Metabase, atau Power BI.", flow: ["Signalbase", "ETL", "Database / BI"] },
];

const PRACTICES = [
  "Simpan kunci di server; jangan pernah di kode browser atau aplikasi seluler.",
  "Saring di server lewat parameter (from, mood, province) daripada mengambil semua lalu menyaring sendiri.",
  `Ambil per halaman dengan size hingga ${MAX_PAGE_SIZE}; hentikan saat page sama dengan pages.`,
  "Simpan hasil sementara (cache) beberapa menit; hitungan di Signalbase sendiri diperbarui sekitar 2 menit sekali.",
  "Pada 503, tunggu sesuai header Retry-After lalu coba lagi; bila berulang, persempit rentang waktu.",
  "Cabut atau ganti kunci dari panel bila bocor; aplikasi lain dengan kunci berbeda tidak terpengaruh.",
];

/** Daily API calls per plan, read from the pricing comparison so the two pages never disagree. */
const CALL_LIMITS = (() => {
  const row = COMPARISON.flatMap((g) => g.rows).find((r) => r.label.startsWith("Panggilan API"));
  return row ? COMPARISON_COLUMNS.map((plan, i) => [plan, String(row.values[i])] as const) : [];
})();

function Section({ id, icon: Icon, label, title, text, children }: { id: string; icon: typeof IconBolt; label: string; title: string; text?: string; children: React.ReactNode }) {
  return (
    <section id={id} className={reveal(c.section)}>
      <div className={c.sectionHead}>
        <span className={c.sectionIcon}><Icon size={20} /></span>
        <div>
          <span className={landing.eyebrow}>{label}</span>
          <h2>{title}</h2>
          {text && <p>{text}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export function IntegrationPage() {
  return (
    <>
      <PageHeader label="INTEGRASI" title="Data Signalbase," accent="langsung di aplikasi Anda."
        text="Satu REST API untuk post media sosial dan berita online, lengkap dengan analisis, pembuat, dan kategori AI. Cakupan setiap proyek diterapkan di server." />

      <div className={c.facts}>
        {FACTS.map(([k, v]) => <div key={k}><small>{k}</small><code>{v}</code></div>)}
      </div>

      <nav className={c.toc} aria-label="Isi halaman">
        {[["mulai", "Mulai"], ["contoh", "Contoh kode"], ["endpoint", "Endpoint"], ["parameter", "Parameter"], ["respons", "Respons"], ["pemakaian", "Pemakaian"], ["batas", "Batas & error"]].map(([id, label]) => (
          <a key={id} href={`#${id}`}>{label}</a>
        ))}
      </nav>

      <Section id="mulai" icon={IconBolt} label="MULAI DALAM 4 LANGKAH" title="Dari daftar sampai data pertama.">
        <ol className={c.steps}>
          {QUICKSTART.map((s, i) => (
            <li key={s.title}><span className={c.stepNo}>{i + 1}</span><s.icon size={20} className={c.stepIcon} /><b>{s.title}</b><p>{s.text}</p></li>
          ))}
        </ol>
      </Section>

      <Section id="contoh" icon={IconPlugConnected} label="CONTOH KODE" title="Permintaan pertama Anda."
        text="Ambil 50 post negatif sejak 1 November dalam cakupan proyek Anda. Ganti SIGNALBASE_KEY dengan kunci API proyek dari panel.">
        <CodeTabs samples={codeSamples(SITE_URL)} />
      </Section>

      <Section id="endpoint" icon={IconRoute} label="ENDPOINT" title="Lima cara memanggil data yang sama."
        text={`Semua memakai GET ${API_PATH}/{social | online} dengan parameter berbeda.`}>
        <div className={c.endpoints}>
          {ENDPOINTS.map((e) => (
            <article key={e.name} className={c.endpoint}>
              <header><b>{e.name}</b>{e.needsAi && <span className={c.aiBadge}><IconSparkles size={11} />Kategorisasi AI</span>}</header>
              <code><span className={c.get}>GET</span> {API_PATH}/social{e.query}</code>
              <p>{e.description}</p>
            </article>
          ))}
        </div>
      </Section>

      <Section id="parameter" icon={IconListDetails} label="PARAMETER" title="Saring tepat di server."
        text="Semua parameter opsional dan bisa digabung. Cakupan proyek (keyword, jenis media, wilayah) selalu berlaku di atasnya; parameter hanya bisa mempersempit.">
        <div className={c.paramGroups}>
          {PARAM_GROUPS.map((g) => (
            <div key={g.title} className={c.tableCard}>
              <h3>{g.title}</h3>
              <table className={c.table}>
                <tbody>
                  {g.params.map((p) => (
                    <tr key={p.name}>
                      <th><code>{p.name}</code>{p.scope && p.scope !== "all" && <span className={c.scope} data-scope={p.scope}>{p.scope}</span>}</th>
                      <td className={c.values}>{p.values}</td>
                      <td>{p.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </Section>

      <Section id="respons" icon={IconTable} label="RESPONS" title="Konten dan konteksnya, dalam satu objek.">
        <div className={c.response}>
          <div className={c.codeCard}>
            <div className={c.codeBar}><span className={c.codeTitle}>200 OK · application/json</span></div>
            <pre className={c.code}><code>{LIST_RESPONSE}</code></pre>
          </div>
          <div className={c.tableCard}>
            <h3>Field setiap item</h3>
            <table className={c.table}>
              <tbody>
                {FIELDS.map(([name, type, desc]) => (
                  <tr key={name}><th><code>{name}</code><small>{type}</small></th><td>{desc}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      <Section id="pemakaian" icon={IconSparkles} label="CONTOH PEMAKAIAN" title="Apa yang biasa dibangun pelanggan.">
        <div className={c.uses}>
          {USES.map((u) => (
            <article key={u.title}>
              <span className={c.useIcon}><u.icon size={22} /></span>
              <h3>{u.title}</h3>
              <p>{u.text}</p>
              <div className={c.flow}>{u.flow.map((f, i) => <span key={f}>{i > 0 && <i>→</i>}{f}</span>)}</div>
            </article>
          ))}
        </div>
      </Section>

      <Section id="batas" icon={IconShieldCheck} label="BATAS, ERROR & PRAKTIK TERBAIK" title="Terukur dan dapat diandalkan.">
        <div className={c.limits}>
          <div className={c.tableCard}>
            <h3>Panggilan API per akun / hari</h3>
            <p className={c.small}>Dibagi untuk semua proyek milik akun; 1 panggilan mengambil hingga {MAX_PAGE_SIZE} item.</p>
            <table className={c.table}>
              <tbody>{CALL_LIMITS.map(([plan, value]) => <tr key={plan}><th>{plan}</th><td className={c.right}>{value}</td></tr>)}</tbody>
            </table>
            <Link href="/pricing" className={c.textLink}>Bandingkan paket <IconArrowUpRight size={15} /></Link>
          </div>
          <div className={c.tableCard}>
            <h3>Kode status</h3>
            <table className={`${c.table} ${c.statusTable}`}>
              <tbody>
                {ERRORS.map(([code, name, desc]) => (
                  <tr key={code}><th><span className={c.status} data-ok={code < 300 || undefined}>{code}</span></th><td><b>{name}</b><br />{desc}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className={c.practices}>
          <h3><IconAlertTriangle size={18} />Praktik terbaik</h3>
          <ul>{PRACTICES.map((p) => <li key={p}><IconCheck size={15} />{p}</li>)}</ul>
        </div>
        <p className={c.docsNote}>Dokumentasi lengkap dengan contoh untuk proyek Anda tersedia di panel setelah masuk: <Link href="/docs">Dokumentasi API</Link>.</p>
      </Section>

      <Cta />
    </>
  );
}
