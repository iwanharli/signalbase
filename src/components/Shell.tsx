"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Avatar, Menu, Tooltip, UnstyledButton } from "@mantine/core";
import { IconBook2, IconChevronDown, IconChartDonut, IconChartDots3, IconFlag, IconFlame, IconHierarchy2, IconKey, IconLayoutDashboard, IconLogout, IconMenu2, IconMessages, IconReceipt, IconShield, IconUsers, IconWorldWww, IconX } from "@tabler/icons-react";
import { DEFAULT_ISSUE_TOPIC } from "@/lib/issues";
import type { Role } from "@/lib/session";
import { LogoMark } from "./Logo";
import { RoleProvider } from "./RoleContext";
import classes from "./shell.module.css";

type NavItem = { href: string; label: string; icon: typeof IconFlame; children?: NavItem[] };

/** Main workspace pages, in the centre of the bar. An item with `children` opens a submenu on hover. */
const NAV: NavItem[] = [
  { href: "/dashboard", label: "Ringkasan", icon: IconLayoutDashboard },
  { href: "/media/social", label: "Media Sosial", icon: IconMessages },
  { href: "/media/online", label: "Media Online", icon: IconWorldWww },
  { href: "/isu", label: "Isu", icon: IconFlame, children: [
    { href: "/isu", label: "Isu Nasional", icon: IconFlag },
    { href: "/isu?topik=polisi", label: "Isu Polisi", icon: IconShield },
  ] },
  { href: "/analisis", label: "Analisis", icon: IconChartDots3, children: [
    { href: "/analisis/sna", label: "SNA", icon: IconChartDots3 },
    { href: "/analisis/ontologi", label: "Ontologi", icon: IconHierarchy2 },
  ] },
  { href: "/api-keys", label: "Proyek", icon: IconKey },
];
/** Secondary pages: icon buttons on the right and entries in the account menu. */
const TOOLS = [
  { href: "/command-center", label: "Command Center", icon: IconChartDonut },
  { href: "/docs", label: "Dokumentasi", icon: IconBook2 },
  { href: "/users", label: "Pengguna", icon: IconUsers, adminOnly: true },
  { href: "/billing", label: "Paket & tagihan", icon: IconReceipt, userOnly: true },
];

/** Shown in the bar for user accounts: plan name and days left, linking to billing. */
export type PlanChip = { label: string; daysLeft: number | null };
const isActive = (href: string, path: string) => (href === "/" ? path === "/" : path.startsWith(href));
/** Like isActive, but a link with ?topik= is active only for that topic (a bare /isu is the default topic). */
const isActiveTopic = (href: string, path: string, topic: string | null) => {
  const [base, query] = href.split("?");
  return path.startsWith(base) && (new URLSearchParams(query).get("topik") ?? DEFAULT_ISSUE_TOPIC) === (topic ?? DEFAULT_ISSUE_TOPIC);
};

export function Shell({ name, username, role, plan, banner, children }: {
  name: string; username: string; role: Role; plan?: PlanChip | null; banner?: React.ReactNode; children: React.ReactNode;
}) {
  const path = usePathname();
  const bare = path === "/command-center"; // stands alone, like a separate page: no top bar
  const topic = useSearchParams().get("topik");
  const nav = role === "user" ? NAV.map((i) => (i.href === "/dashboard" ? { ...i, label: "Beranda" } : i)) : NAV;
  const tools = TOOLS.filter((t) => (role === "user" ? !("adminOnly" in t) : !("userOnly" in t)));
  const barTools = tools.filter((t) => t.href !== "/billing");
  const menuTools = tools.filter((t) => t.href === "/billing");
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

      {!bare && <header className={classes.bar} data-scrolled={scrolled || undefined}>
        <div className={classes.frame}>
          <Link href="/dashboard" className={classes.brand} aria-label="Signalbase">
            <span className={classes.mark}><LogoMark size={32} /></span>
            <span className={classes.brandText}>Signal<b>base</b></span>
          </Link>

          <nav ref={navRef} className={classes.nav}>
            {pill && <span className={classes.pill} style={{ transform: `translateX(${pill.left}px)`, width: pill.width }} />}
            {nav.map((i) => {
              const link = (
                <Link key={i.href} href={i.href} className={classes.link} aria-label={i.label} aria-current={isActive(i.href, path) ? "page" : undefined} data-active={isActive(i.href, path) || undefined}>
                  <i.icon size={17} stroke={1.8} /><span>{i.label}</span>
                </Link>
              );
              if (!i.children) return link;
              return (
                <Menu key={i.href} trigger="hover" openDelay={60} closeDelay={120} position="bottom-start" offset={10} width={200} transitionProps={{ transition: "pop-top-left", duration: 140 }}>
                  <Menu.Target>{link}</Menu.Target>
                  <Menu.Dropdown>
                    {i.children.map((c) => (
                      <Menu.Item key={c.href} component={Link} href={c.href} leftSection={<c.icon size={16} />} data-active={isActiveTopic(c.href, path, topic) || undefined}
                        style={isActiveTopic(c.href, path, topic) ? { fontWeight: 700, color: "var(--mantine-color-violet-7)" } : undefined}>{c.label}</Menu.Item>
                    ))}
                  </Menu.Dropdown>
                </Menu>
              );
            })}
          </nav>

          <div className={classes.right}>
            {plan && (
              <Link href="/billing" className={classes.planChip} data-warn={plan.daysLeft !== null && plan.daysLeft <= 3 || undefined}>
                <b>{plan.label}</b>{plan.daysLeft !== null && <span>{plan.daysLeft <= 0 ? "berakhir" : `${plan.daysLeft} hari`}</span>}
              </Link>
            )}
            {barTools.map((t) => (
              <Tooltip key={t.href} label={t.label} withArrow openDelay={250}>
                <Link href={t.href} className={classes.iconLink} aria-label={t.label} data-active={isActive(t.href, path) || undefined}><t.icon size={18} stroke={1.8} /></Link>
              </Tooltip>
            ))}
            <Menu position="bottom-end" width={240} offset={12} transitionProps={{ transition: "pop-top-right", duration: 160 }}>
              <Menu.Target>
                <UnstyledButton className={classes.user} aria-label={`Menu akun ${name}`}>
                  <Avatar size={30} radius="xl" variant="gradient" gradient={{ from: "violet", to: "cyan", deg: 135 }}>{name.charAt(0)}</Avatar>
                  <span className={classes.userName}>{name}</span>
                  <IconChevronDown size={14} className={classes.userChevron} />
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <div className={classes.menuHead}>
                  <Avatar size={38} radius="xl" variant="gradient" gradient={{ from: "violet", to: "cyan", deg: 135 }}>{name.charAt(0)}</Avatar>
                  <div><b>{name}</b><small>@{username} · {role === "admin" ? "Admin" : "User"}</small></div>
                </div>
                {/* Only what has no icon in the bar (billing); docs and users already sit there. */}
                {menuTools.length > 0 && <Menu.Divider />}
                {menuTools.map((t) => (
                  <Menu.Item key={t.href} component={Link} href={t.href} leftSection={<t.icon size={16} />}>{t.label}</Menu.Item>
                ))}
                <Menu.Divider />
                <Menu.Item color="red" leftSection={<IconLogout size={16} />} onClick={logout}>Keluar</Menu.Item>
              </Menu.Dropdown>
            </Menu>
            <UnstyledButton className={classes.burger} onClick={() => setOpen((o) => !o)} aria-label={open ? "Tutup menu" : "Buka menu"} aria-controls="main-mobile-navigation" aria-expanded={open}>
              {open ? <IconX size={20} /> : <IconMenu2 size={20} />}
            </UnstyledButton>
          </div>
        </div>

        <nav id="main-mobile-navigation" aria-label="Navigasi utama" className={classes.sheet} data-open={open || undefined} inert={!open} onKeyDown={(event) => { if (event.key === "Escape") { setOpen(false); document.querySelector<HTMLButtonElement>('[aria-controls="main-mobile-navigation"]')?.focus(); } }}>
          {[...nav.flatMap((i) => i.children ?? [i]), ...tools].map((i, n) => (
            <Link key={i.href} href={i.href} className={classes.sheetLink} aria-current={isActiveTopic(i.href, path, topic) ? "page" : undefined} data-active={isActiveTopic(i.href, path, topic) || undefined} style={{ transitionDelay: open ? `${n * 40}ms` : "0ms" }}>
              <i.icon size={19} stroke={1.8} />{i.label}
            </Link>
          ))}
        </nav>
      </header>}

      <main key={path} className={classes.main} data-bare={bare || undefined}>{banner}<RoleProvider value={role}>{children}</RoleProvider></main>
    </div>
  );
}
