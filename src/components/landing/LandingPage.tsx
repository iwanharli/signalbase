// Public landing page at "/". Content lives in content.ts, sections in sections.tsx, styles in landing.module.css.
import { LandingNav } from "./LandingNav";
import { Reveal } from "./Reveal";
import { AiSection, ControlStrip, Cta, Faq, Features, Hero, Integration, LandingFooter, Sources, UseCaseSection, Workflow } from "./sections";
import c from "./landing.module.css";

export function LandingPage() {
  return (
    <div className={c.page}>
      <a href="#main" className={c.skip}>Lewati navigasi</a>
      <LandingNav />
      <main id="main">
        <Hero />
        <Sources />
        <Features />
        <AiSection />
        <Workflow />
        <Integration />
        <UseCaseSection />
        <ControlStrip />
        <Faq />
        <Cta />
      </main>
      <LandingFooter />
      <Reveal />
    </div>
  );
}
