"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppShell, Burger, Group, Menu, Text, UnstyledButton, Avatar } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconBook2, IconChevronDown, IconKey, IconLayoutDashboard, IconLogout, IconMessages, IconWorldWww } from "@tabler/icons-react";
import { Logo } from "./Logo";
import classes from "./shell.module.css";

const NAV = [
  { section: "Ringkasan", items: [{ href: "/", label: "Ringkasan", icon: IconLayoutDashboard }] },
  { section: "Kurasi", items: [
    { href: "/kurasi/sosial", label: "Media Sosial", icon: IconMessages },
    { href: "/kurasi/online", label: "Media Online", icon: IconWorldWww },
  ] },
  { section: "Integrasi", items: [
    { href: "/kunci-api", label: "Kunci API", icon: IconKey },
    { href: "/dokumentasi", label: "Dokumentasi API", icon: IconBook2 },
  ] },
];

export function Shell({ name, children }: { name: string; children: React.ReactNode }) {
  const [opened, { toggle, close }] = useDisclosure();
  const path = usePathname();
  const logout = async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; };
  return (
    <AppShell header={{ height: 60 }} navbar={{ width: 248, breakpoint: "sm", collapsed: { mobile: !opened } }} padding={{ base: "md", sm: "xl" }} layout="alt">
      <AppShell.Header className={classes.header}>
        <Group h="100%" px="lg" justify="space-between">
          <Group gap="sm">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="Menu" />
            <Text fw={700} fz={15}>{NAV.flatMap((s) => s.items).find((i) => i.href === path || (i.href !== "/" && path.startsWith(i.href)))?.label ?? "Signalbase"}</Text>
          </Group>
          <Menu position="bottom-end" width={180}>
            <Menu.Target>
              <UnstyledButton className={classes.user}>
                <Avatar size={30} radius="xl" color="violet">{name.charAt(0)}</Avatar>
                <Text fz={14} fw={600} visibleFrom="xs">{name}</Text>
                <IconChevronDown size={15} />
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown><Menu.Item color="red" leftSection={<IconLogout size={16} />} onClick={logout}>Keluar</Menu.Item></Menu.Dropdown>
          </Menu>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar className={classes.navbar} p="md">
        <div className={classes.brand}><Logo light /></div>
        {NAV.map((s) => (
          <div key={s.section} className={classes.section}>
            <Text className={classes.sectionLabel}>{s.section}</Text>
            {s.items.map((i) => {
              const active = i.href === "/" ? path === "/" : path.startsWith(i.href);
              return (
                <Link key={i.href} href={i.href} onClick={close} className={classes.link} data-active={active || undefined}>
                  <i.icon size={19} stroke={1.7} />{i.label}
                </Link>
              );
            })}
          </div>
        ))}
        <Text className={classes.foot}>Sumber: bankkomen (hanya baca)</Text>
      </AppShell.Navbar>
      <AppShell.Main className={classes.main}>{children}</AppShell.Main>
    </AppShell>
  );
}
