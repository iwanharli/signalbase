// Frame shared by every public page (/, /fitur, /integrasi, /solusi, /pricing, /faq): nav, footer and scroll fade-ins.
import { LandingNav } from "./LandingNav";
import { Reveal } from "./Reveal";
import { LandingFooter } from "./sections";
import c from "./landing.module.css";

export function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={c.page}>
      <a href="#main" className={c.skip}>Lewati navigasi</a>
      <LandingNav />
      <main id="main">{children}</main>
      <LandingFooter />
      <Reveal />
    </div>
  );
}
