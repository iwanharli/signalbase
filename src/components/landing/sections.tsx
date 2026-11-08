// The landing page sections, top to bottom. Server components: only UseCases, the nav, and the product preview run in the browser.
import Link from "next/link";
import { IconArrowRight, IconArrowUpRight, IconBolt, IconCheck, IconChevronDown, IconCode, IconSearch, IconShieldCheck, IconSparkles } from "@tabler/icons-react";
import { AI_POINTS, AI_PROVIDERS, API_POINTS, FAQS, FEATURES, HERO_TRUST, SOURCES, STEPS } from "./content";
import { Brand, Floaters, SectionTitle, SignalWave } from "./decor";
import { ProductPreview } from "./preview/ProductPreview";
import { UseCases } from "./UseCases";
import c from "./landing.module.css";

/** Section class plus the fade-in-on-scroll marker. */
const reveal = (...classes: string[]) => [...classes, c.reveal].join(" ");

export function Hero() {
  return (
    <section className={c.hero}>
      <div className={c.heroGlow} />
      <div className={c.heroGrid} />
      <SignalWave />
      <Floaters />
      <div className={c.heroIntro}>
        <span className={c.heroPill}><i />MEDIA INTELLIGENCE, CONNECTED.</span>
        <h1>Di balik setiap percakapan, <br />ada <em>sinyal berarti.</em></h1>
        <p>Satukan percakapan media sosial dan pemberitaan.<br className={c.desktopBreak} /> Pahami konteksnya dengan AI. Hubungkan insight ke aplikasi Anda.</p>
        <div className={c.heroActions}>
          <a href="#platform" className={c.primary}>Jelajahi Signalbase <IconArrowRight size={18} /></a>
          <a href="#integrasi" className={c.secondary}><IconCode size={18} />Kenali API-nya</a>
        </div>
        <div className={c.heroTrust}>{HERO_TRUST.map((t) => <span key={t}><IconCheck size={14} />{t}</span>)}</div>
      </div>
      <div className={c.previewWrap} id="platform">
        <div className={c.previewLabel}><span>ONE PLATFORM. A CLEARER PICTURE.</span><span>01 — THE WORKSPACE</span></div>
        <ProductPreview />
      </div>
    </section>
  );
}

export function Sources() {
  return (
    <section className={reveal(c.sources)}>
      <p>Beragam sumber. <br /><strong>Satu ruang pemahaman.</strong></p>
      <div>{SOURCES.map(({ icon: Icon, label }) => <span key={label}><Icon size={21} />{label}</span>)}</div>
    </section>
  );
}

export function Features() {
  return (
    <section id="fitur" className={reveal(c.section)}>
      <SectionTitle label="DARI DATA KE PEMAHAMAN" title="Bukan sekadar melihat ramai. Memahami apa yang berarti." text="Dari eksplorasi pertama sampai integrasi ke sistem Anda, Signalbase menjaga data, konteks, dan akses tetap terhubung." />
      <div className={c.features}>
        {FEATURES.map((f, i) => (
          <article key={f.title} className={i === 0 ? `${c.feature} ${c.featureWide}` : c.feature}>
            <span className={c.featureIcon}><f.icon size={23} /></span>
            <small>{f.tag}</small>
            <h3>{f.title}</h3>
            <p>{f.text}</p>
            {i === 0 ? (
              <div className={c.filterDemo}>
                <span><IconSearch size={14} />pelayanan publik</span>
                <span>Indonesia <IconChevronDown size={12} /></span>
                <span>30 hari <IconChevronDown size={12} /></span>
                <b><IconCheck size={12} />Lebih relevan</b>
              </div>
            ) : (
              <div className={c.featureLine}><span>0{i + 1}</span><IconArrowUpRight size={20} /></div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

export function AiSection() {
  return (
    <section className={reveal(c.aiSection)}>
      <div className={c.aiCopy}>
        <span className={c.eyebrow}>INTELLIGENCE, ON YOUR TERMS</span>
        <h2>AI yang mengikuti <br />konteks Anda.</h2>
        <p>Setiap organisasi punya pertanyaan berbeda. Tentukan kategori, instruksi, dan model yang sesuai—lalu biarkan Signalbase membantu mengelompokkan konten.</p>
        <ul>{AI_POINTS.map((p) => <li key={p}><IconCheck />{p}</li>)}</ul>
        <div className={c.providers}>{AI_PROVIDERS.map((p) => <span key={p}>{p}</span>)}</div>
      </div>
      <div className={c.aiVisual}>
        <div className={c.aiVisualHead}><span><IconSparkles size={18} />Analisis sesuai kebutuhan</span></div>
        <div className={c.aiInput}>
          <small>KONTEN MASUK</small>
          <p>“Pelayanan sekarang lebih cepat. Laporan saya langsung ditindaklanjuti oleh petugas.”</p>
        </div>
        <div className={c.aiConnector}><span /><IconBolt size={22} /><span /></div>
        <div className={c.aiResult}>
          <header><span><IconCheck size={15} />Hasil kategorisasi</span><b>Pelayanan publik</b></header>
          <p>Apresiasi terhadap kecepatan respons dan tindak lanjut layanan.</p>
          <div><span>Emosi <b>Mendukung</b></span><span>Kategori <b>Sesuai konteks</b></span></div>
        </div>
        <div className={c.reviewNote}><IconShieldCheck size={17} /><span>AI membantu membaca pola. <br /><b>Anda tetap memegang kendali.</b></span></div>
      </div>
    </section>
  );
}

export function Workflow() {
  return (
    <section id="cara-kerja" className={reveal(c.section, c.workflow)}>
      <SectionTitle label="SIMPLE FLOW. MEANINGFUL SIGNALS." title="Dari arus informasi ke aplikasi Anda." />
      <div className={c.steps}>
        {STEPS.map((s, i) => (
          <article key={s.title}>
            <span className={c.stepIcon} aria-hidden><s.icon size={20} /></span>
            <span>0{i + 1}</span>
            <h3>{s.title}</h3>
            <p>{s.text}</p>
            <IconArrowRight size={22} />
          </article>
        ))}
      </div>
    </section>
  );
}

export function Integration() {
  return (
    <section id="integrasi" className={reveal(c.integration)}>
      <div>
        <span className={c.eyebrow}>BUILT TO CONNECT</span>
        <h2>Insight tidak berhenti <br />di satu dashboard.</h2>
        <p>Gunakan Signalbase sebagai fondasi data untuk aplikasi Anda. Respons JSON terstruktur membawa konten dan konteks ke tempat keputusan dibuat.</p>
        <div className={c.apiPoints}>{API_POINTS.map((p) => <span key={p}><IconCheck />{p}</span>)}</div>
        <Link href="/docs" className={c.textLink}>Lihat dokumentasi di panel <IconArrowUpRight size={17} /></Link>
      </div>
      <div className={c.codeWindow}>
        <header><span><i /><i /><i /></span><b>signalbase-api.ts</b><span>REST / JSON</span></header>
        <pre><code>
          <span className={c.codePurple}>const</span> response = <span className={c.codePurple}>await</span> fetch(<br />
          <span className={c.codeGreen}>  `${"{"}SIGNALBASE_URL{"}"}/api/v1/media/social`</span>, {"{"}<br />
          {"  "}headers: {"{"}<br />
          {"    "}<span className={c.codeBlue}>&quot;x-api-key&quot;</span>: process.env.SIGNALBASE_KEY<br />
          {"  "}{"}"}<br />
          {"}"});<br /><br />
          <span className={c.codePurple}>const</span> {"{"} items {"}"} = <span className={c.codePurple}>await</span> response.json();
        </code></pre>
        <div className={c.jsonPreview}>
          <small>EXAMPLE RESPONSE</small>
          <code>
            {"{"}<br />
            {"  "}<span>&quot;source&quot;</span>: &quot;twitter&quot;,<br />
            {"  "}<span>&quot;mood&quot;</span>: &quot;mendukung&quot;,<br />
            {"  "}<span>&quot;classification&quot;</span>: {"{"}<br />
            {"    "}<span>&quot;category&quot;</span>: &quot;layanan_publik&quot;<br />
            {"  "}{"}"}<br />
            {"}"}
          </code>
        </div>
        <footer><IconShieldCheck size={15} />Simpan kunci di server aplikasi Anda.</footer>
      </div>
    </section>
  );
}

export function UseCaseSection() {
  return (
    <section className={reveal(c.section, c.useCases)}>
      <SectionTitle label="SATU FONDASI, BANYAK PERSPEKTIF" title="Dibangun untuk pertanyaan yang berbeda." />
      <UseCases />
    </section>
  );
}

export function ControlStrip() {
  return (
    <section className={reveal(c.controlStrip)}>
      <IconShieldCheck size={42} />
      <div>
        <h3>Terbuka untuk integrasi. Terukur dalam kendali.</h3>
        <p>Cakupan akses di server, kunci yang dapat dirotasi dan dicabut, serta peninjauan manusia atas hasil AI.</p>
      </div>
      <span>YOUR SIGNALS. <br /><b>YOUR CONTROL.</b></span>
    </section>
  );
}

export function Faq() {
  return (
    <section id="faq" className={reveal(c.section, c.faq)}>
      <SectionTitle label="PERTANYAAN UMUM" title="Kenali lebih dekat." text="Hal-hal yang perlu diketahui sebelum menghubungkan Signalbase ke alur kerja Anda." />
      <div>
        {FAQS.map(([q, a], i) => (
          <details key={q} open={i === 0}>
            <summary>{q}<IconChevronDown size={18} /></summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function Cta() {
  return (
    <section className={reveal(c.cta)}>
      <div className={c.ctaOrbit} aria-hidden />
      <Floaters dark />
      <span className={c.eyebrow}>MAKE THE SIGNAL MATTER.</span>
      <h2>Informasi terus bergerak. <br /><em>Pemahaman Anda juga.</em></h2>
      <p>Mulai jelajahi data. Temukan konteks yang relevan. <br />Bangun pengalaman yang lebih berarti dengan Signalbase.</p>
      <div className={c.ctaButtons}>
        <Link href="/register" className={c.primary}>Buat akun <IconArrowUpRight size={18} /></Link>
        <Link href="/login" className={c.ctaGhost}>Saya sudah punya akun</Link>
      </div>
      <a href="#platform" className={c.ctaSmall}>Lihat kembali pratinjau produk ↑</a>
    </section>
  );
}

export function LandingFooter() {
  return (
    <footer className={c.footer}>
      <div>
        <a href="#" aria-label="Signalbase beranda"><Brand /></a>
        <p>Media intelligence. <br />Connected to your world.</p>
      </div>
      <div><b>Platform</b><a href="#fitur">Fitur</a><a href="#cara-kerja">Cara kerja</a><a href="#integrasi">Integrasi API</a></div>
      <div><b>Jelajahi</b><a href="#faq">Pertanyaan umum</a><Link href="/login">Masuk</Link><Link href="/register">Daftar</Link><Link href="/docs">Dokumentasi ↗</Link></div>
      <div className={c.footerBottom}>
        <span>© {new Date().getFullYear()} Signalbase.</span>
        <span>Menemukan makna di antara jutaan percakapan.</span>
        <a href="#">Kembali ke atas ↑</a>
      </div>
    </footer>
  );
}
