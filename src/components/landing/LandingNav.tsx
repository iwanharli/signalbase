"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconArrowUpRight, IconMenu2, IconX } from "@tabler/icons-react";
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
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  // The white pill slides from the previous page's link to the current one.
  useLayoutEffect(() => {
    const place = () => {
      const el = navRef.current?.querySelector<HTMLElement>('a[aria-current="page"]');
      setPill(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled((on) => (on ? window.scrollY > SCROLLED_OFF : window.scrollY > SCROLLED_ON));
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={c.nav} data-scrolled={scrolled || undefined}>
      <Link href="/" aria-label="Signalbase beranda"><Brand /></Link>
      <nav ref={navRef} aria-label="Navigasi landing page" data-open={menu}>
        <span className={c.navPill} aria-hidden style={pill ? { transform: `translateX(${pill.left}px)`, width: pill.width, opacity: 1 } : { opacity: 0 }} />
        {NAV_LINKS.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} onClick={() => setMenu(false)} aria-current={pathname === href ? "page" : undefined}>
            <Icon size={15} stroke={1.8} />{label}
          </Link>
        ))}
        <div className={c.menuFoot}>
          <Link href="/login" className={c.menuSignIn}>Masuk</Link>
          <Link href="/register?plan=trial" className={c.menuTrial}>Coba 7 hari <IconArrowUpRight size={15} /></Link>
        </div>
      </nav>
      <div className={c.navActions}>
        <Link href="/login" className={c.navSignIn}>Masuk</Link>
        <Link href="/register?plan=trial" className={c.navLogin}>Coba 7 hari <IconArrowUpRight size={15} /></Link>
      </div>
      <button type="button" className={c.menuButton} onClick={() => setMenu(!menu)} aria-label={menu ? "Tutup navigasi" : "Buka navigasi"} aria-expanded={menu}>{menu ? <IconX size={20} /> : <IconMenu2 size={20} />}</button>
    </header>
  );
}
