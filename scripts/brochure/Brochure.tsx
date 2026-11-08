// Signalbase product-knowledge brochure: A4 pages rendered to static HTML, then printed to PDF by build.tsx.
// All copy, features and prices come from the website's own data, so the PDF never disagrees with /pricing.
/* eslint-disable @next/next/no-head-element, @next/next/no-page-custom-font -- a standalone print document, not a Next.js page */
import {
  IconArrowRight, IconBrandFacebook, IconBrandInstagram, IconBrandThreads, IconBrandTiktok, IconBrandX, IconBrandYoutube,
  IconCheck, IconClockHour4, IconKey, IconLock, IconMinus, IconPlugConnected, IconSearch, IconShieldCheck, IconSparkles, IconUsers, IconWorldWww,
} from "@tabler/icons-react";
import { AI_POINTS, AI_PROVIDERS, API_POINTS, FEATURES, STEPS, USE_CASES } from "../../src/components/landing/content";
import { BROCHURE_EDITION, COMPARISON, COMPARISON_COLUMNS, formatRupiah, PLANS, PRICING_FAQS, TRIAL, YEARLY_DISCOUNT, yearlyPrice } from "../../src/components/pricing/plans";
import { ANALYSED_TOTAL, ARCHIVE, ARCHIVE_TOTAL, AS_OF, compactId, DAILY, MOODS, ONLINE_OUTLETS, PER_DAY, PROVINCES, SOCIAL_PLATFORMS } from "./stats";
import { css } from "./styles";

const SITE = "signalbase.kecup.in";
const SOURCES = [[IconBrandX, "X / Twitter"], [IconBrandInstagram, "Instagram"], [IconBrandThreads, "Threads"], [IconBrandTiktok, "TikTok"], [IconBrandYoutube, "YouTube"], [IconBrandFacebook, "Facebook"], [IconWorldWww, "Media online"]] as const;

function Mark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <defs>
        <linearGradient id="mbg" x1="0" y1="0" x2="40" y2="40"><stop offset="0" stopColor="#1e1b4b" /><stop offset="1" stopColor="#0d0b1f" /></linearGradient>
        <linearGradient id="mrim" x1="0" y1="40" x2="40" y2="0"><stop offset="0" stopColor="#7c3aed" /><stop offset="1" stopColor="#22d3ee" /></linearGradient>
        <linearGradient id="mpulse" x1="7" y1="0" x2="33" y2="0"><stop offset="0" stopColor="#c4b5fd" /><stop offset=".5" stopColor="#fff" /><stop offset="1" stopColor="#67e8f9" /></linearGradient>
      </defs>
      <rect x="1" y="1" width="38" height="38" rx="12" fill="url(#mbg)" stroke="url(#mrim)" strokeWidth="1.6" />
      <circle cx="20" cy="20" r="12.5" fill="none" stroke="url(#mrim)" strokeWidth="1.4" strokeDasharray="30 9 6 9" strokeLinecap="round" opacity=".75" />
      <circle cx="32.5" cy="20" r="1.6" fill="#22d3ee" />
      <path d="M8 21h5.5l2.6-6.5 4 12.5 3-9 2 3h6.9" fill="none" stroke="url(#mpulse)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Brand({ light }: { light?: boolean }) {
  return <span className={light ? "brand light" : "brand"}><Mark size={30} /><span>Signal<b>base</b></span></span>;
}

/** One A4 page with a running header and page number. */
function Sheet({ n, title, children, dark }: { n: number; title?: string; children: React.ReactNode; dark?: boolean }) {
  return (
    <section className={dark ? "sheet dark" : "sheet"}>
      {title && <header className="run"><Brand /><span>{title}</span></header>}
      <div className="body">{children}</div>
      {n > 1 && <footer className="foot"><span>Signalbase · Product Knowledge</span><span>{SITE}</span><b>{String(n).padStart(2, "0")}</b></footer>}
    </section>
  );
}

function Heading({ label, title, accent, text }: { label: string; title: string; accent?: string; text?: string }) {
  return (
    <div className="heading">
      <span className="eyebrow">{label}</span>
      <h2>{title}{accent && <> <em>{accent}</em></>}</h2>
      {text && <p>{text}</p>}
    </div>
  );
}

/** Stacked daily bars (social + online) for the cover, drawn as SVG so the PDF stays sharp. */
function DailyBars() {
  const totals = DAILY.social.map((n, i) => n + DAILY.online[i]);
  const peak = Math.max(...totals);
  const w = 300, h = 74, gap = 5, bw = (w - gap * (totals.length - 1)) / totals.length;
  return (
    <svg className="bars" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="bS" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c4b5fd" /><stop offset="1" stopColor="#7c3aed" /></linearGradient>
        <linearGradient id="bO" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#67e8f9" /><stop offset="1" stopColor="#0891b2" /></linearGradient>
      </defs>
      {totals.map((t, i) => {
        const x = i * (bw + gap);
        const hs = (DAILY.social[i] / peak) * h, ho = (DAILY.online[i] / peak) * h;
        return <g key={i}><rect x={x} y={h - hs - ho} width={bw} height={ho} rx="2" fill="url(#bO)" /><rect x={x} y={h - hs} width={bw} height={hs} rx="2" fill="url(#bS)" /></g>;
      })}
    </svg>
  );
}

function Cover() {
  const stats: [string, string, string][] = [
    [`${compactId(PER_DAY)}+`, "konten baru", "setiap hari"],
    [`${compactId(ANALYSED_TOTAL)}+`, "konten", "sudah dianalisis"],
    [`${ONLINE_OUTLETS.toLocaleString("id-ID")}+`, "media online", "dipantau"],
    [`${SOCIAL_PLATFORMS}`, "platform", "media sosial"],
    [`${PROVINCES}`, "provinsi", "terpetakan"],
  ];
  return (
    <section className="sheet cover">
      <div className="coverGrid" />
      <div className="coverGlow" />
      <div className="coverTop"><Brand light /><span className="pill">PRODUCT KNOWLEDGE · {new Date().getFullYear()}</span></div>
      <div className="coverMain">
        <h1>Di balik setiap percakapan, <em>ada sinyal berarti.</em></h1>
        <p>Bank data media sosial dan berita online, dianalisis dengan AI, dan siap dihubungkan ke aplikasi Anda lewat API.</p>
      </div>

      <div className="heroStat">
        <div className="heroNum">
          <small>ARSIP SIGNALBASE</small>
          <b>{compactId(ARCHIVE_TOTAL)}<i>+</i></b>
          <span>konten media sosial & berita online</span>
          <div className="split">
            <span><i className="dotS" />{compactId(ARCHIVE.social)} post sosial</span>
            <span><i className="dotO" />{compactId(ARCHIVE.online)} berita</span>
          </div>
        </div>
        <div className="heroChart">
          <small>VOLUME HARIAN · {DAILY.social.length} HARI TERAKHIR</small>
          <DailyBars />
          <div className="legendRow"><span><i className="dotS" />Media sosial</span><span><i className="dotO" />Media online</span><b>± {compactId(PER_DAY)} / hari</b></div>
        </div>
      </div>

      <div className="statGrid">
        {stats.map(([value, label, sub]) => <div key={label}><b>{value}</b><span>{label}</span><small>{sub}</small></div>)}
      </div>

      <div className="moodBlock">
        {([["EMOSI MEDIA SOSIAL · 7 HARI", MOODS.social], ["SENTIMEN BERITA · 7 HARI", MOODS.online]] as const).map(([title, moods]) => (
          <div key={title}>
            <small>{title}</small>
            <div className="moodBar">{moods.map(([l, p, col]) => <i key={l} style={{ flexGrow: p, background: col }} />)}</div>
            <div className="moodLegend">{moods.map(([l, p, col]) => <span key={l}><i style={{ background: col }} />{l} <b>{p}%</b></span>)}</div>
          </div>
        ))}
      </div>

      <div className="coverToc">
        {["Apa itu Signalbase", "Fitur utama", "Analisis & AI", "Cara kerja & integrasi", "Solusi", "Paket & harga", "Perbandingan paket", "Pertanyaan umum"].map((t, i) => (
          <span key={t}><b>{String(i + 2).padStart(2, "0")}</b>{t}</span>
        ))}
      </div>

      <div className="coverFoot"><span>Data bank Signalbase per {AS_OF}</span><span>{SITE} · Trial {TRIAL.days} hari</span></div>
    </section>
  );
}

function About() {
  return (
    <Sheet n={2} title="Apa itu Signalbase">
      <Heading label="APA ITU SIGNALBASE" title="Satu bank data untuk" accent="memahami percakapan publik."
        text="Signalbase mengumpulkan post media sosial dan berita online, memperkaya setiap konten dengan analisis, lalu membukanya untuk tim Anda lewat panel dan untuk aplikasi Anda lewat API." />
      <div className="problem">
        <div><span className="tag red">TANPA SIGNALBASE</span><ul>
          <li>Percakapan tersebar di banyak platform dan media.</li>
          <li>Tim membaca manual, sulit memisahkan yang relevan.</li>
          <li>Data tidak bisa langsung dipakai aplikasi lain.</li>
        </ul></div>
        <IconArrowRight size={28} className="problemArrow" />
        <div><span className="tag green">DENGAN SIGNALBASE</span><ul>
          <li>Satu tempat untuk sosial dan berita, disaring per keyword.</li>
          <li>Emosi, sentimen, ringkasan, dan relevansi sudah tersedia.</li>
          <li>Kunci API dengan cakupan sendiri untuk setiap aplikasi.</li>
        </ul></div>
      </div>
      <h3 className="sub">Sumber data</h3>
      <div className="sources">{SOURCES.map(([Icon, label]) => <span key={label}><Icon size={20} />{label}</span>)}</div>
      <h3 className="sub">Untuk siapa</h3>
      <div className="who">
        {[[IconUsers, "Humas & komunikasi", "Memantau reputasi dan isu yang menyebut organisasi."], [IconShieldCheck, "Instansi & layanan publik", "Membaca suara masyarakat per wilayah dan kategori."], [IconPlugConnected, "Tim produk & data", "Membangun dashboard dan aplikasi di atas data media."]].map(([Icon, t, d]) => {
          const I = Icon as typeof IconUsers;
          return <div key={t as string}><span className="ico"><I size={20} /></span><b>{t as string}</b><p>{d as string}</p></div>;
        })}
      </div>
      <h3 className="sub">Mengapa Signalbase</h3>
      <div className="why">
        {[["Satu sumber", "Sosial dan berita dalam satu bank data, tidak perlu banyak alat."], ["Sudah dianalisis", "Emosi, sentimen, dan ringkasan tersedia tanpa membaca manual."], ["Siap integrasi", "Data yang sama di panel dan di API untuk aplikasi Anda."], ["Terkendali", "Cakupan per kunci, persetujuan admin, kunci bisa dicabut."]].map(([t, d], i) => (
          <div key={t}><b>0{i + 1}</b><span><strong>{t}</strong>{d}</span></div>
        ))}
      </div>
    </Sheet>
  );
}

function Features() {
  return (
    <Sheet n={3} title="Fitur utama">
      <Heading label="FITUR UTAMA" title="Dari eksplorasi" accent="sampai integrasi." text="Empat kemampuan inti yang bekerja di atas satu bank data media." />
      <div className="features">
        {FEATURES.map((f, i) => (
          <div key={f.title} className="feature">
            <span className="ico"><f.icon size={22} /></span>
            <small>{String(i + 1).padStart(2, "0")} · {f.tag}</small>
            <h3>{f.title}</h3>
            <p>{f.text}</p>
          </div>
        ))}
      </div>
      <h3 className="sub">Yang Anda lihat di panel</h3>
      <div className="panelList">
        {[["Beranda per kunci", "Volume 14 hari, sebaran emosi, dan sinyal terbaru untuk keyword Anda."], ["Media sosial & online", "Kartu post dan berita lengkap dengan pembuat, platform, metrik, dan analisis."], ["Filter lengkap", "Waktu, platform, wilayah, bahasa, emosi, relevansi, dan kategori AI."], ["Detail post", "Isi lengkap, ringkasan, sasaran, skor, dan tautan ke post asli."]].map(([t, d]) => (
          <div key={t}><IconCheck size={16} /><span><b>{t}</b>{d}</span></div>
        ))}
      </div>
      <div className="twoWays">
        <div><span className="tag cyan">PANEL</span><h3>Untuk tim Anda</h3><p>Telusuri, saring, dan baca konteks setiap post langsung di browser. Tidak perlu instalasi.</p></div>
        <span className="eq">=</span>
        <div><span className="tag cyan">API</span><h3>Untuk aplikasi Anda</h3><p>Data dan analisis yang sama, dalam JSON, dengan cakupan yang sama per kunci.</p></div>
      </div>
    </Sheet>
  );
}

function Analysis() {
  return (
    <Sheet n={4} title="Analisis & AI">
      <Heading label="ANALISIS & AI" title="Baca makna" accent="di balik kata." text="Dua lapis pemahaman: analisis yang sudah tersedia di bank data, dan kategorisasi AI dengan kategori milik Anda sendiri." />
      <div className="two">
        <div className="card">
          <span className="tag violet">ANALISIS BANK DATA</span>
          <h3>Tersedia untuk setiap post</h3>
          <ul className="checks">
            {["Emosi (sosial) & sentimen (berita)", "Intensitas emosi", "Ringkasan isi & sasaran", "Relevansi & filter yang tidak relevan", "Skor, sinyal & faktor", "Topik & label watchlist"].map((t) => <li key={t}><IconCheck size={15} />{t}</li>)}
          </ul>
        </div>
        <div className="card darkCard">
          <span className="tag cyan">SIGNALBASE AI</span>
          <h3>Kategori Anda, cara pandang Anda</h3>
          <ul className="checks">{AI_POINTS.map((t) => <li key={t}><IconCheck size={15} />{t}</li>)}</ul>
          <p className="muted">Tanpa perlu akun AI sendiri: kategorisasi AI otomatis sudah termasuk dalam paket Pro dan Instansi. Paket Instansi memakai model enhancement yang disetel khusus.</p>
        </div>
      </div>
      <div className="example">
        <div className="exIn"><small>KONTEN MASUK</small><p>“Pelayanan sekarang lebih cepat. Laporan saya langsung ditindaklanjuti oleh petugas.”</p></div>
        <IconArrowRight size={26} className="exArrow" />
        <div className="exOut">
          <small><IconSparkles size={12} /> HASIL</small>
          <div className="exRow"><span>Emosi</span><b className="pos">Mendukung</b></div>
          <div className="exRow"><span>Kategori AI</span><b>Pelayanan publik</b></div>
          <div className="exRow"><span>Ringkasan</span><b>Apresiasi kecepatan respons layanan</b></div>
          <div className="exRow"><span>Relevansi</span><b>Relevan</b></div>
        </div>
      </div>
      <h3 className="sub">Cara kerja Signalbase AI</h3>
      <div className="aiSteps">
        {[["Tentukan kategori", "Tulis kategori dan instruksi sesuai kebutuhan, berbeda untuk sosial dan berita bila perlu."], ["AI melabeli otomatis", "Data baru diproses lebih dulu, lalu arsip dalam rentang yang Anda pilih."], ["Tinjau & koreksi", "Hasil berkeyakinan rendah ditandai untuk ditinjau; koreksi tersimpan permanen."]].map(([t, d], i) => (
          <div key={t}><b>{i + 1}</b><strong>{t}</strong><p>{d}</p></div>
        ))}
      </div>
      <p className="note">Penyedia yang didukung untuk kunci AI sendiri: {AI_PROVIDERS.join(", ")}.</p>
    </Sheet>
  );
}

function HowItWorks() {
  return (
    <Sheet n={5} title="Cara kerja & integrasi">
      <Heading label="CARA KERJA" title="Dari arus informasi" accent="ke aplikasi Anda." />
      <div className="steps">
        {STEPS.map((s, i) => (
          <div key={s.title}><span className="ico"><s.icon size={20} /></span><small>0{i + 1}</small><h3>{s.title}</h3><p>{s.text}</p></div>
        ))}
      </div>
      <div className="integration">
        <div>
          <span className="eyebrow">INTEGRASI API</span>
          <h3>Respons JSON yang konsisten</h3>
          <ul className="checks">{API_POINTS.map((t) => <li key={t}><IconCheck size={15} />{t}</li>)}</ul>
        </div>
        <pre className="code"><span className="k">GET</span> /api/v1/media/social?mood=negative&amp;size=20{"\n"}<span className="d">x-api-key: sb_••••••••</span>{"\n\n"}{"{"}{"\n"}  <span className="s">&quot;items&quot;</span>: [{"{"}{"\n"}    <span className="s">&quot;source&quot;</span>: &quot;twitter&quot;,{"\n"}    <span className="s">&quot;author&quot;</span>: {"{"} <span className="s">&quot;name&quot;</span>: &quot;Rina K.&quot; {"}"},{"\n"}    <span className="s">&quot;mood&quot;</span>: &quot;mendukung&quot;,{"\n"}    <span className="s">&quot;classification&quot;</span>: {"{"} <span className="s">&quot;category&quot;</span>: &quot;layanan_publik&quot; {"}"}{"\n"}  {"}"}]{"\n"}{"}"}</pre>
      </div>
      <h3 className="sub">Yang tersedia lewat API</h3>
      <div className="apiData">
        {[["Daftar konten", "Post & berita dengan filter waktu, platform, wilayah, emosi"], ["Ringkasan", "Total dan sebaran emosi / sentimen"], ["Pilihan filter", "Sumber, wilayah, dan kategori yang tersedia"], ["Tren kategori", "Volume per kategori AI dari waktu ke waktu"]].map(([t, d]) => (
          <div key={t}><b>{t}</b><span>{d}</span></div>
        ))}
      </div>
      <h3 className="sub">Keamanan & kendali</h3>
      <div className="security">
        {[[IconKey, "Cakupan per kunci", "Keyword, jenis media, dan wilayah diterapkan di server."], [IconLock, "Rotasi & cabut", "Kunci bisa diganti atau dicabut kapan saja."], [IconShieldCheck, "Persetujuan admin", "Setiap akun baru ditinjau sebelum aktif."]].map(([Icon, t, d]) => {
          const I = Icon as typeof IconKey;
          return <div key={t as string}><I size={20} /><b>{t as string}</b><p>{d as string}</p></div>;
        })}
      </div>
    </Sheet>
  );
}

function Solutions() {
  return (
    <Sheet n={6} title="Solusi">
      <Heading label="SOLUSI" title="Satu fondasi," accent="banyak perspektif." text="Contoh cara organisasi memakai Signalbase untuk pertanyaan yang berbeda." />
      <div className="cases">
        {USE_CASES.map((u, i) => (
          <div key={u.tab} className="case">
            <span className="caseNo">0{i + 1}</span>
            <div>
              <small>{u.tab.toUpperCase()}</small>
              <h3>{u.title}</h3>
              <p>{u.text}</p>
              <div className="chips">{u.tags.map((t) => <span key={t}>{t}</span>)}</div>
            </div>
          </div>
        ))}
      </div>
      <h3 className="sub">Langkah memulai</h3>
      <div className="start">
        {[["Daftar", "Buat akun di situs Signalbase."], ["Disetujui admin", `Trial ${TRIAL.days} hari dimulai.`], ["Atur keyword", "Buat kunci API dan pilih keyword."], ["Pantau & hubungkan", "Lihat beranda, lalu sambungkan API."]].map(([t, d], i) => (
          <div key={t}><b>{i + 1}</b><strong>{t}</strong><p>{d}</p></div>
        ))}
      </div>
      <div className="quote"><IconSearch size={22} /><p>“Mulai dari satu keyword. Dalam hitungan menit setelah akun disetujui, beranda Anda menampilkan tren, emosi, dan post terbaru yang relevan.”</p></div>
    </Sheet>
  );
}

function Pricing() {
  return (
    <Sheet n={7} title="Paket & harga">
      <Heading label="PAKET & HARGA" title="Paket yang tumbuh" accent="bersama kebutuhan Anda." text={`Mulai dengan trial ${TRIAL.days} hari, lalu pilih paket. Pembayaran tahunan hemat ${Math.round(YEARLY_DISCOUNT * 100)}%.`} />
      <div className="trial">
        <span className="ico"><IconClockHour4 size={22} /></span>
        <div><b>Trial {TRIAL.days} hari, tanpa biaya</b><div className="trialList">{TRIAL.includes.map((t) => <span key={t}><IconCheck size={13} />{t}</span>)}</div></div>
      </div>
      <div className="plans">
        {PLANS.map((p) => (
          <div key={p.id} className={p.featured ? "plan featured" : "plan"}>
            {p.featured && <span className="popular"><IconSparkles size={11} /> Paling populer</span>}
            <h3>{p.name}</h3>
            <p className="tagline">{p.tagline}</p>
            <div className="price">
              {p.startsFrom && <small className="from">MULAI DARI</small>}
              <b>{formatRupiah(p.monthly)}<span>/bulan</span></b>
              <small>{p.startsFrom ? "Penawaran disesuaikan kebutuhan" : `atau ${formatRupiah(yearlyPrice(p.monthly))} per tahun (hemat ${Math.round(YEARLY_DISCOUNT * 100)}%)`}</small>
            </div>
            <ul>{p.highlights.map((h) => <li key={h}><IconCheck size={14} />{h}</li>)}</ul>
          </div>
        ))}
      </div>
      <h3 className="sub">Paket mana yang tepat?</h3>
      <div className="guide">
        {[["Starter", "Anda memantau beberapa isu, cukup emosi & sentimen, dan riwayat sebulan."], ["Pro", "Anda memantau banyak isu, butuh ringkasan & relevansi, kategorisasi AI, dan riwayat setahun."], ["Instansi", "Anda butuh seluruh arsip, analisis terlengkap, model enhancement, dan pendampingan."]].map(([t, d]) => (
          <div key={t}><b>{t}</b><p>Pilih jika {d.charAt(0).toLowerCase() + d.slice(1)}</p></div>
        ))}
      </div>
      <p className="note">Harga belum termasuk PPN. Semua akun ditinjau admin sebelum aktif.</p>
    </Sheet>
  );
}

function Comparison() {
  return (
    <Sheet n={8} title="Perbandingan paket">
      <Heading label="PERBANDINGAN LENGKAP" title="Detail setiap paket." />
      <table className="table">
        <thead><tr><th />{COMPARISON_COLUMNS.map((c) => <th key={c} className={c === "Pro" ? "hl" : undefined}>{c}</th>)}</tr></thead>
        {COMPARISON.map((g) => (
          <tbody key={g.group}>
            <tr className="group"><th colSpan={COMPARISON_COLUMNS.length + 1}>{g.group}</th></tr>
            {g.rows.map((r) => (
              <tr key={r.label}>
                <th>{r.label}{r.note && <small className="rowNote">{r.note}</small>}</th>
                {r.values.map((v, i) => (
                  <td key={i} className={COMPARISON_COLUMNS[i] === "Pro" ? "hl" : undefined}>
                    {v === true ? <IconCheck size={15} className="yes" /> : v === false ? <IconMinus size={15} className="no" /> : v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </Sheet>
  );
}

function Faq() {
  const items = PRICING_FAQS;
  return (
    <Sheet n={9} title="Pertanyaan umum">
      <Heading label="PERTANYAAN UMUM" title="Sebelum" accent="memulai." />
      <div className="faq">{items.map(([q, a]) => <div key={q}><b>{q}</b><p>{a}</p></div>)}</div>
      <div className="cta">
        <div><h3>Siap menemukan sinyal Anda?</h3><p>Daftar di {SITE}/register dan mulai trial {TRIAL.days} hari. Untuk paket Instansi, tim kami akan menghubungi Anda setelah pendaftaran.</p></div>
        <span className="ctaBtn">{SITE}<IconArrowRight size={16} /></span>
      </div>
    </Sheet>
  );
}

export function Brochure() {
  return (
    <html lang="id">
      <head>
        <meta charSet="utf-8" />
        <title>{`Signalbase - Product Knowledge (${BROCHURE_EDITION})`}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>
        <Cover />
        <About />
        <Features />
        <Analysis />
        <HowItWorks />
        <Solutions />
        <Pricing />
        <Comparison />
        <Faq />
      </body>
    </html>
  );
}
