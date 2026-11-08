"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { IconArrowUpRight, IconMenu2 } from "@tabler/icons-react";
import { NAV_LINKS } from "./content";
import { Brand } from "./decor";
import c from "./landing.module.css";

/** Turns the glass background on below this scroll offset and off again above the lower one, so it never flips back and forth. */
const SCROLLED_ON = 24;
const SCROLLED_OFF = 8;

/** Sticky top bar with section links, sign-in/sign-up, and a menu on phones. */
export function LandingNav() {
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled((on) => (on ? window.scrollY > SCROLLED_OFF : window.scrollY > SCROLLED_ON));
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={c.nav} data-scrolled={scrolled || undefined}>
      <a href="#" aria-label="Signalbase beranda"><Brand /></a>
      <nav aria-label="Navigasi landing page" data-open={menu}>
        {NAV_LINKS.map(({ href, label }) => <a key={href} href={href} onClick={() => setMenu(false)}>{label}</a>)}
        <Link href="/login" className={c.menuSignIn}>Masuk</Link>
      </nav>
      <div className={c.navActions}>
        <Link href="/login" className={c.navSignIn}>Masuk</Link>
        <Link href="/register" className={c.navLogin}>Daftar gratis <IconArrowUpRight size={15} /></Link>
      </div>
      <button type="button" className={c.menuButton} onClick={() => setMenu(!menu)} aria-label="Buka navigasi" aria-expanded={menu}><IconMenu2 /></button>
    </header>
  );
}
