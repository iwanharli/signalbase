"use client";
// Top bar: the active project. A dropdown when there is a choice (staff can also pick the whole bank),
// a plain label when a client has one project.
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Menu, UnstyledButton } from "@mantine/core";
import { IconCheck, IconChevronDown, IconDatabase, IconFolder, IconSettings } from "@tabler/icons-react";
import { isProjectPage, readActiveProject, saveActiveProject } from "@/lib/activeProject";
import type { Role } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import classes from "./projectSwitcher.module.css";

type Project = { id: string; name: string; revokedAt: string | null };
const ALL = "Seluruh bank";

export function ProjectSwitcher({ role }: { role: Role }) {
  const path = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const { data } = useApi<Project[]>("/api/admin/keys");
  const projects = (data ?? []).filter((p) => !p.revokedAt).sort((a, b) => a.name.localeCompare(b.name, "id"));
  const staff = role !== "user";
  const scoped = isProjectPage(path);
  const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => setSaved(readActiveProject()), [path, params]);
  const activeId = (scoped ? params.get("key") : null) ?? saved;
  const active = projects.find((p) => p.id === activeId) ?? null;

  const choose = (id: string | null) => {
    saveActiveProject(id);
    setSaved(id);
    if (!scoped) return;
    // A new project starts clean: only the issue topic carries over.
    const next = new URLSearchParams();
    const topic = params.get("topik");
    if (topic) next.set("topik", topic);
    if (id) next.set("key", id);
    router.push(next.size ? `${path}?${next}` : path);
  };

  // A remembered project that is gone (deleted, or another account's) is forgotten.
  const stale = !!data && !!saved && !projects.some((p) => p.id === saved);
  useEffect(() => { if (stale) choose(staff ? null : projects[0]?.id ?? null); });

  if (!data || (!staff && !projects.length)) return null;
  const label = active?.name ?? (staff ? ALL : projects[0]?.name);
  const chip = (open: boolean) => (
    <>
      <span className={classes.icon}>{active || !staff ? <IconFolder size={14} /> : <IconDatabase size={14} />}</span>
      <span className={classes.text}>{label}</span>
      {open && <IconChevronDown size={14} className={classes.chevron} />}
    </>
  );
  if (!staff && projects.length < 2) return <div className={classes.chip} title={`Proyek aktif: ${label}`}>{chip(false)}</div>;

  return (
    <Menu position="bottom-end" width={260} offset={12} transitionProps={{ transition: "pop-top-right", duration: 160 }}>
      <Menu.Target>
        <UnstyledButton className={classes.chip} aria-label={`Proyek aktif: ${label}. Ganti proyek`}>{chip(true)}</UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown className={classes.dropdown}>
        <Menu.Label>Pilih proyek</Menu.Label>
        {staff && (
          <Menu.Item leftSection={<IconDatabase size={16} />} rightSection={!active ? <IconCheck size={14} /> : null} onClick={() => choose(null)} data-active={!active || undefined}>{ALL}</Menu.Item>
        )}
        {projects.map((p) => (
          <Menu.Item key={p.id} leftSection={<IconFolder size={16} />} rightSection={p.id === active?.id ? <IconCheck size={14} /> : null} onClick={() => choose(p.id)} data-active={p.id === active?.id || undefined}>{p.name}</Menu.Item>
        ))}
        {staff && (<>
          <Menu.Divider />
          <Menu.Item component={Link} href={active ? `/project/${active.id}` : "/project"} leftSection={<IconSettings size={16} />}>{active ? "Pengaturan proyek" : "Kelola proyek"}</Menu.Item>
        </>)}
      </Menu.Dropdown>
    </Menu>
  );
}
