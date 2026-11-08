"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar, Menu, Text, UnstyledButton } from "@mantine/core";
import { IconBook2, IconChevronDown, IconKey, IconLayoutDashboard, IconLogout, IconMenu2, IconMessages, IconReceipt, IconUsers, IconWorldWww, IconX } from "@tabler/icons-react";
import type { Role } from "@/lib/session";
import { LogoMark } from "./Logo";
import { RoleProvider } from "./RoleContext";
import classes from "./shell.module.css";

const NAV = [
  { href: "/dashboard", label: "Ringkasan", icon: IconLayoutDashboard },
  { href: "/media/social", label: "Media Sosial", icon: IconMessages },
  { href: "/media/online", label: "Media Online", icon: IconWorldWww },
  { href: "/api-keys", label: "Kunci API", icon: IconKey },
  { href: "/docs", label: "Dokumentasi", icon: IconBook2 },
  { href: "/users", label: "Pengguna", icon: IconUsers, adminOnly: true },
  { href: "/billing", label: "Tagihan", icon: IconReceipt, userOnly: true },
];
const isActive = (href: string, path: string) => (href === "/" ? path === "/" : path.startsWith(href));

export function Shell({ name, role, banner, children }: { name: string; role: Role; banner?: React.ReactNode; children: React.ReactNode }) {
  const path = usePathname();
  const nav = role === "user"
    ? NAV.filter((i) => !("adminOnly" in i)).map((i) => (i.href === "/dashboard" ? { ...i, label: "Beranda" } : i))
    : NAV.filter((i) => !("userOnly" in i));
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const logout = async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; };

  useEffect(() => {
    const onScroll = () => {
      const on = window.scrollY > 12;
      setScrolled(on);
      document.documentElement.toggleAttribute("data-scrolled", on); // lets sticky page bars follow the shrinking top bar
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => setOpen(false), [path]);

  // Slide the glowing pill under the active link.
  useLayoutEffect(() => {
    const place = () => {
      const el = navRef.current?.querySelector<HTMLElement>("[data-active]");
      setPill(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [path]);

  return (
    <div className={classes.root}>
      <div className={classes.backdrop} aria-hidden><span /><span /><span /></div>

      <header className={classes.bar} data-scrolled={scrolled || undefined}>
        <div className={classes.frame}>
          <Link href="/dashboard" className={classes.brand} aria-label="Signalbase">
            <span className={classes.mark}><LogoMark size={32} /></span>
            <span className={classes.brandText}>Signal<b>base</b></span>
          </Link>

          <nav ref={navRef} className={classes.nav}>
            {pill && <span className={classes.pill} style={{ transform: `translateX(${pill.left}px)`, width: pill.width }} />}
            {nav.map((i) => (
              <Link key={i.href} href={i.href} className={classes.link} aria-label={i.label} aria-current={isActive(i.href, path) ? "page" : undefined} data-active={isActive(i.href, path) || undefined}>
                <i.icon size={17} stroke={1.8} /><span>{i.label}</span>
              </Link>
            ))}
          </nav>

          <div className={classes.right}>
            <span className={classes.live}>{role === "user" ? "AKUN USER" : "PANEL ADMIN"}</span>
            <Menu position="bottom-end" width={190} offset={14} transitionProps={{ transition: "pop-top-right", duration: 160 }}>
              <Menu.Target>
                <UnstyledButton className={classes.user} aria-label={`Menu akun ${name}`}>
                  <Avatar size={28} radius="xl" variant="gradient" gradient={{ from: "violet", to: "cyan", deg: 135 }}>{name.charAt(0)}</Avatar>
                  <Text fz={13} fw={600} visibleFrom="md" c="white">{name}</Text>
                  <IconChevronDown size={14} color="rgba(255,255,255,.6)" />
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown><Menu.Item color="red" leftSection={<IconLogout size={16} />} onClick={logout}>Keluar</Menu.Item></Menu.Dropdown>
            </Menu>
            <UnstyledButton className={classes.burger} onClick={() => setOpen((o) => !o)} aria-label={open ? "Tutup menu" : "Buka menu"} aria-controls="main-mobile-navigation" aria-expanded={open}>
              {open ? <IconX size={20} /> : <IconMenu2 size={20} />}
            </UnstyledButton>
          </div>
        </div>

        <nav id="main-mobile-navigation" aria-label="Navigasi utama" className={classes.sheet} data-open={open || undefined} inert={!open} onKeyDown={(event) => { if (event.key === "Escape") { setOpen(false); document.querySelector<HTMLButtonElement>('[aria-controls="main-mobile-navigation"]')?.focus(); } }}>
          {nav.map((i, n) => (
            <Link key={i.href} href={i.href} className={classes.sheetLink} aria-current={isActive(i.href, path) ? "page" : undefined} data-active={isActive(i.href, path) || undefined} style={{ transitionDelay: open ? `${n * 40}ms` : "0ms" }}>
              <i.icon size={19} stroke={1.8} />{i.label}
            </Link>
          ))}
        </nav>
      </header>

      <main key={path} className={classes.main}>{banner}<RoleProvider value={role}>{children}</RoleProvider></main>
    </div>
  );
}
