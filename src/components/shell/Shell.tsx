"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Avatar, Menu, Tooltip, UnstyledButton, useComputedColorScheme, useMantineColorScheme } from "@mantine/core";
import { IconBook2, IconChevronDown, IconMoon, IconSun, IconChartDonut, IconChartDots3, IconFlame, IconHierarchy2, IconKey, IconLayoutDashboard, IconLogout, IconMenu2, IconMessages, IconBellRinging, IconSparkles, IconFileDescription, IconUsers, IconWorldWww, IconX, IconPhotoScan } from "@tabler/icons-react";
import { DEFAULT_ISSUE_TOPIC } from "@/lib/issues";
import type { Role } from "@/lib/session";
import { LogoMark } from "../Logo";
import { AiProgressDock } from "./AiProgressDock";
import { MediaAlertsBell } from "./MediaAlertsBell";
import { MediaWorkerAlert } from "./MediaWorkerAlert";
import { RoleProvider } from "./RoleContext";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { isProjectPage, projectPath, saveActiveProject, splitProjectPath } from "@/lib/activeProject";
import { SAVED_FILTERS_PREFIX } from "@/lib/media/filters";
import classes from "./shell.module.css";

type NavItem = { href: string; label: string; icon: typeof IconFlame; children?: NavItem[];
  /** Shown to admins only (features still on trial). */ adminOnly?: boolean;
  /** Hidden from clients (admins and viewers see it). */ staffOnly?: boolean };

/** Main workspace pages, in the centre of the bar. An item with `children` opens a submenu on hover. */
const NAV: NavItem[] = [
  { href: "/dashboard", label: "Ringkasan", icon: IconLayoutDashboard },
  { href: "/media/social", label: "Media Sosial", icon: IconMessages },
  { href: "/media/online", label: "Media Online", icon: IconWorldWww },
  { href: "/issues/media-online", label: "Isu", icon: IconFlame, children: [
    { href: "/issues/media-online", label: "Isu Media Online", icon: IconWorldWww },
    { href: "/issues/media-social", label: "Isu Media Sosial", icon: IconBellRinging },
  ] },
  { href: "/analysis/sna", label: "Analisis", icon: IconChartDots3, children: [
    { href: "/analysis/sna", label: "SNA", icon: IconChartDots3 },
    { href: "/analysis/ontology", label: "Ontologi", icon: IconHierarchy2 },
    { href: "/analysis/media", label: "Media visual", icon: IconPhotoScan },
  ] },
  { href: "/reports", label: "Laporan", icon: IconFileDescription },
  // Projects are set up by admins; clients only use the projects given to them.
  { href: "/projects", label: "Proyek", icon: IconKey, staffOnly: true },
];
/** Secondary pages: icon buttons on the right (inMenu: only in the account menu). */
const TOOLS = [
  { href: "/command-center", label: "Command Center", icon: IconChartDonut },
  { href: "/docs", label: "Dokumentasi", icon: IconBook2, inMenu: true },
  { href: "/users", label: "Pengguna", icon: IconUsers, adminOnly: true },
  { href: "/ai", label: "Pengaturan AI", icon: IconSparkles, adminOnly: true },
];

/** `path` is the page without its /projects/<id> prefix (see Shell). An item with children is active on any of them. */
const isActive = (item: { href: string; children?: NavItem[] }, path: string): boolean =>
  item.children ? item.children.some((c) => isActive(c, path)) : path.startsWith(item.href.split("?")[0]);
/** Like isActive, but a link with ?topik= is active only for that topic (none = the default topic). */
const isActiveTopic = (href: string, path: string, topic: string | null) => {
  const [base, query] = href.split("?");
  return path.startsWith(base) && (new URLSearchParams(query).get("topik") ?? DEFAULT_ISSUE_TOPIC) === (topic ?? DEFAULT_ISSUE_TOPIC);
};

export function Shell({ name, username, role, children }: { name: string; username: string; role: Role; children: React.ReactNode }) {
  const path = usePathname();
  // Data pages of a project live under /projects/<id>: menu links stay in that project, and are matched without the prefix.
  const { id: projectId, page } = splitProjectPath(path);
  const here = isProjectPage(page) ? page : path;
  const to = (href: string) => (isProjectPage(href) ? projectPath(projectId, href) : href);
  const bare = page === "/command-center"; // stands alone, like a separate page: no top bar
  const topic = useSearchParams().get("topik");
  const nav = NAV
    .filter((i) => !(i.staffOnly && role === "user"))
    .map((i) => (i.children ? { ...i, children: i.children.filter((c) => !c.adminOnly || role === "admin") } : i))
    .map((i) => (role === "user" && i.href === "/dashboard" ? { ...i, label: "Beranda" } : i));
  const barTools = TOOLS.filter((t) => role === "admin" || !("adminOnly" in t));
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    // Saved media filters (search words included) and the active project must not reach the next account in this browser.
    saveActiveProject(null);
    try { Object.keys(localStorage).filter((k) => k.startsWith(SAVED_FILTERS_PREFIX)).forEach((k) => localStorage.removeItem(k)); } catch { /* storage unavailable */ }
    window.location.href = "/login";
  };

  useEffect(() => {
    let compact = false;
    const onScroll = () => {
      const y = window.scrollY;
      const on = y > 12;
      setScrolled(on);
      document.documentElement.toggleAttribute("data-scrolled", on); // lets sticky page bars follow the shrinking top bar
      // Page bars that fold to one line (media summary) change the page height, and the browser then moves the scroll back:
      // a single threshold would flip them on and off. They fold past 160px and unfold only back near the top.
      compact = compact ? y > 40 : y > 160;
      document.documentElement.toggleAttribute("data-compact", compact);
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
        <div className={classes.frame} data-crowded={role !== "user" || undefined}>
          <div className={classes.start}>
            <Link href={to("/dashboard")} className={classes.brand} aria-label="Signalbase">
              <span className={classes.mark}><LogoMark size={32} /></span>
              <span className={classes.brandText}>Signal<b>base</b></span>
            </Link>
            <ProjectSwitcher role={role} />
          </div>

          <nav ref={navRef} className={classes.nav}>
            {pill && <span className={classes.pill} style={{ transform: `translateX(${pill.left}px)`, width: pill.width }} />}
            {nav.map((i) => {
              const link = (
                <Link key={i.href} href={to(i.href)} className={classes.link} aria-label={i.label} title={i.label} aria-current={isActive(i, here) ? "page" : undefined} data-active={isActive(i, here) || undefined}>
                  <i.icon size={17} stroke={1.8} /><span>{i.label}</span>
                </Link>
              );
              if (!i.children) return link;
              return (
                <Menu key={i.href} trigger="hover" openDelay={60} closeDelay={120} position="bottom-start" offset={10} width={200} transitionProps={{ transition: "pop-top-left", duration: 140 }}>
                  <Menu.Target>{link}</Menu.Target>
                  <Menu.Dropdown>
                    {i.children.map((c) => (
                      <Menu.Item key={c.href} component={Link} href={to(c.href)} leftSection={<c.icon size={16} />} data-active={isActiveTopic(c.href, here, topic) || undefined}
                        style={isActiveTopic(c.href, here, topic) ? { fontWeight: 700, color: "var(--mantine-color-violet-7)" } : undefined}>{c.label}</Menu.Item>
                    ))}
                  </Menu.Dropdown>
                </Menu>
              );
            })}
          </nav>

          <div className={classes.right}>
            {role === "admin" && <MediaWorkerAlert />}
            <MediaAlertsBell />
            {barTools.filter((t) => !("inMenu" in t)).map((t) => (
              <Tooltip key={t.href} label={t.label} withArrow openDelay={250}>
                <Link href={to(t.href)} className={classes.iconLink} aria-label={t.label} data-active={isActive(t, here) || undefined}><t.icon size={18} stroke={1.8} /></Link>
              </Tooltip>
            ))}
            <ThemeToggle />
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
                  <div><b>{name}</b><small>@{username} · {role === "admin" ? "Admin" : role === "viewer" ? "Viewer" : "Pengguna"}</small></div>
                </div>
                <Menu.Divider />
                {barTools.filter((t) => "inMenu" in t).map((t) => (
                  <Menu.Item key={t.href} component={Link} href={t.href} leftSection={<t.icon size={16} />}>{t.label}</Menu.Item>
                ))}
                <Menu.Item color="red" leftSection={<IconLogout size={16} />} onClick={logout}>Keluar</Menu.Item>
              </Menu.Dropdown>
            </Menu>
            <UnstyledButton className={classes.burger} onClick={() => setOpen((o) => !o)} aria-label={open ? "Tutup menu" : "Buka menu"} aria-controls="main-mobile-navigation" aria-expanded={open}>
              {open ? <IconX size={20} /> : <IconMenu2 size={20} />}
            </UnstyledButton>
          </div>
        </div>

        <nav id="main-mobile-navigation" aria-label="Navigasi utama" className={classes.sheet} data-open={open || undefined} inert={!open} onKeyDown={(event) => { if (event.key === "Escape") { setOpen(false); document.querySelector<HTMLButtonElement>('[aria-controls="main-mobile-navigation"]')?.focus(); } }}>
          {[...nav.flatMap((i) => i.children ?? [i]), ...barTools].map((i, n) => (
            <Link key={i.href} href={to(i.href)} className={classes.sheetLink} aria-current={isActiveTopic(i.href, here, topic) ? "page" : undefined} data-active={isActiveTopic(i.href, here, topic) || undefined} style={{ transitionDelay: open ? `${n * 40}ms` : "0ms" }}>
              <i.icon size={19} stroke={1.8} />{i.label}
            </Link>
          ))}
        </nav>
      </header>}

      <main key={path} className={classes.main} data-bare={bare || undefined}><RoleProvider value={role}>{children}</RoleProvider></main>
      {/* Outside <main> (re-mounted per page), so it stays on screen and keeps its data while moving between pages. */}
      {!bare && <AiProgressDock />}
    </div>
  );
}

/** Light/dark switch in the top bar; Mantine stores the choice in localStorage. The server can't know that choice, so
 *  the markup is the same for both schemes and CSS shows the right icon from the attribute Mantine sets on <html>. */
function ThemeToggle() {
  const { setColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme("light", { getInitialValueInEffect: true });
  return (
    <Tooltip label="Ganti mode terang / gelap" withArrow openDelay={250}>
      <UnstyledButton className={classes.themeToggle} aria-label="Ganti mode terang / gelap" onClick={() => setColorScheme(scheme === "dark" ? "light" : "dark")}>
        <IconMoon size={18} stroke={1.8} className={classes.moon} />
        <IconSun size={18} stroke={1.8} className={classes.sun} />
      </UnstyledButton>
    </Tooltip>
  );
}
