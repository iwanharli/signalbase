// Home page at "/": the product story in short, with a door to each detailed page.
// Content lives in content.ts, sections in sections.tsx, styles in landing.module.css.
import { ControlStrip, Cta, Explore, Hero, Sources } from "./sections";

export function LandingPage() {
  return (
    <>
      <Hero />
      <Sources />
      <Explore />
      <ControlStrip />
      <Cta />
    </>
  );
}
