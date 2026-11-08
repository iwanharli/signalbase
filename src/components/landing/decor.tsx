// Small shared pieces of the landing page: brand mark, section titles and the decorative hero/CTA graphics.
import { IconBrandInstagram, IconBrandTiktok, IconBrandX, IconHash, IconMapPin, IconMoodSmile, IconSparkles, IconTrendingUp } from "@tabler/icons-react";
import { LogoMark } from "../Logo";
import c from "./landing.module.css";

export function Brand() {
  return <span className={c.brand}><LogoMark size={34} /><span>Signal<span>base</span></span></span>;
}

export function SectionTitle({ label, title, text }: { label: string; title: string; text?: string }) {
  return (
    <div className={c.sectionTitle}>
      <span className={c.eyebrow}>{label}</span>
      <h2>{title}</h2>
      {text && <p>{text}</p>}
    </div>
  );
}

/** Top of a detail page (/fitur, /integrasi, …): label, title with a coloured half, and a lead paragraph. */
export function PageHeader({ label, title, accent, text }: { label: string; title: string; accent: string; text: string }) {
  return (
    <header className={c.pageHeader}>
      <div className={c.pageHeaderGlow} aria-hidden />
      <span className={c.eyebrow}>{label}</span>
      <h1>{title} <em>{accent}</em></h1>
      <p>{text}</p>
    </header>
  );
}

// Positions live in CSS (.f1 … .f8); the dark variant (CTA) shows all eight, the hero only the first six.
const FLOAT_ICONS = [IconBrandX, IconBrandInstagram, IconSparkles, IconBrandTiktok, IconMoodSmile, IconHash, IconMapPin, IconTrendingUp];

/** Decorative icons drifting around a section; hidden from assistive tech. */
export function Floaters({ dark }: { dark?: boolean }) {
  return (
    <div className={c.floaters} data-dark={dark || undefined} aria-hidden>
      {FLOAT_ICONS.map((Icon, i) => <span key={i} className={c[`f${i + 1}`]}><Icon size={20} stroke={1.7} /></span>)}
    </div>
  );
}

const WAVE_PATH = "M0 80 C100 80 120 80 180 80 S240 20 270 80 300 140 330 80 360 80 420 80 460 30 490 80 520 130 550 80 600 80 680 80 720 10 750 80 780 150 810 80 870 80 1200 80";

/** Signal line behind the hero heading: drawn once, then it breathes (echo layers swell out of phase) while a spark travels along it. */
export function SignalWave() {
  return (
    <svg className={c.wave} viewBox="0 0 1200 160" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="sbWave" x1="0" x2="1">
          <stop offset="0" stopColor="#7850e9" stopOpacity="0" /><stop offset=".5" stopColor="#7850e9" /><stop offset="1" stopColor="#3cc6d8" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="sbSpark" x1="0" x2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#c9b8ff" /><stop offset="1" stopColor="#7fe3ef" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g className={c.waveEcho2}><path d={WAVE_PATH} fill="none" stroke="url(#sbWave)" strokeWidth="1" /></g>
      <g className={c.waveEcho1}><path d={WAVE_PATH} fill="none" stroke="url(#sbWave)" strokeWidth="1.4" /></g>
      <g className={c.waveMain}>
        <path d={WAVE_PATH} fill="none" stroke="url(#sbWave)" strokeWidth="9" strokeLinecap="round" className={c.waveGlow} />
        <path d={WAVE_PATH} fill="none" stroke="url(#sbWave)" strokeWidth="2" className={c.waveLine} pathLength={1000} />
        <path d={WAVE_PATH} fill="none" stroke="url(#sbSpark)" strokeWidth="3" strokeLinecap="round" className={c.waveSpark} pathLength={1000} />
      </g>
    </svg>
  );
}
