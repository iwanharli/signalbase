"use client";
// Admin page for user accounts: create accounts (a client's main account, a sub-account that follows its plan, or a
// viewer), approve or reject sign-ups, suspend or re-activate accounts, set plans and choose each account's projects.
import { useEffect, useState } from "react";
import { Checkbox, Modal, PasswordInput, SegmentedControl, Select, Skeleton, Stack, Switch, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconArrowRight, IconCheck, IconClockHour4, IconCreditCard, IconFolders, IconPlayerPause, IconPlayerPlay, IconPlus, IconUserPlus, IconUsers, IconX } from "@tabler/icons-react";
import { api, post } from "@/lib/api-client";
import { daysLeft, PLAN_IDS, PLAN_LABEL, PLAN_LIMITS, TRIAL_DAYS, type PlanId } from "@/lib/plans";
import { useApi } from "@/lib/useApi";
import { fromNow } from "../apiKeys/shared";
import { Button, ButtonGroup, StatusPill } from "../ui/Button";
import classes from "../apiKeys/apiKeyList.module.css";
import { ContactRequests } from "./ContactRequests";
import { InvoiceAdmin } from "./InvoiceAdmin";

type Status = "pending" | "active" | "suspended";
type UserRow = {
  id: string; name: string; username: string; role: "admin" | "user" | "viewer"; status: Status; self: boolean; plan: PlanId | null; planExpiresAt: string | null;
  requestedPlan: PlanId | null; createdAt: string; keys: number;
  /** Demo account: billing hidden from it (sub-accounts follow their main account). */
  demo: boolean;
  /** Set for a sub-account: the client's main account, whose plan and status it follows. */
  parentId: string | null; parent: { id: string; name: string; plan: PlanId | null; planExpiresAt: string | null; status: Status; demo: boolean } | null;
};
const isMain = (u: UserRow) => u.role === "user" && !u.parentId;

/** "Trial · sisa 3 hari", "Pro · berakhir", or "Tanpa paket". */
function PlanCell({ user }: { user: UserRow }) {
  if (user.role === "admin") return <span className={classes.muted}>Admin · akses penuh</span>;
  if (user.role === "viewer") return <span className={classes.muted}>Viewer · lihat semua data</span>;
  if (user.parent) {
    const p = user.parent;
    return <span className={classes.aiCell}><span className={classes.pills}><StatusPill tone="neutral">{p.plan ? PLAN_LABEL[p.plan] : "Tanpa paket"}</StatusPill>{p.demo && <StatusPill tone="warning">Demo</StatusPill>}</span><small>ikut paket {p.name}</small></span>;
  }
  if (user.demo) {
    return <span className={classes.aiCell}><span className={classes.pills}>{user.plan && <StatusPill tone="info">{PLAN_LABEL[user.plan]}</StatusPill>}<StatusPill tone="warning">Demo</StatusPill></span><small>menu paket & tagihan disembunyikan</small></span>;
  }
  if (user.status === "pending") {
    return user.requestedPlan && user.requestedPlan !== "trial"
      ? <span className={classes.aiCell}><StatusPill tone="info">{PLAN_LABEL[user.requestedPlan]}</StatusPill><small>diminati saat daftar</small></span>
      : <span className={classes.muted}>Trial saat disetujui</span>;
  }
  if (!user.plan) return <span className={classes.muted}>Tanpa paket</span>;
  const left = daysLeft(user.planExpiresAt);
  const tone = left === null ? "success" : left <= 0 ? "danger" : left <= 2 ? "warning" : "info";
  const note = left === null ? "tanpa batas waktu" : left <= 0 ? "berakhir" : left === 1 ? "hari terakhir" : `sisa ${left} hari`;
  return <span className={classes.aiCell}><StatusPill tone={tone}>{PLAN_LABEL[user.plan]}</StatusPill><small>{note}</small></span>;
}

/** Choose a plan and its end date. Picking a plan proposes a sensible end date (trial 7 days, paid 1 month). */
function PlanModal({ user, onClose, onSaved }: { user: UserRow | null; onClose: () => void; onSaved: () => void }) {
  const [plan, setPlan] = useState<string | null>(null);
  const [until, setUntil] = useState("");
  const [demo, setDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!user) return;
    setPlan(user.plan);
    setDemo(!!user.demo);
    setUntil(user.planExpiresAt ? new Date(user.planExpiresAt).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }) : "");
  }, [user]);
  const pick = (value: string | null) => {
    setPlan(value);
    const days = value === "trial" ? TRIAL_DAYS : value ? 30 : 0;
    setUntil(days ? new Date(Date.now() + days * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }) : "");
  };
  const save = async () => {
    if (!user) return;
    setBusy(true);
    try {
      await post(`/api/admin/users/${user.id}`, { action: "setPlan", plan, expiresAt: until || null, demo }, "PATCH");
      notifications.show({ color: "teal", message: `Paket ${user.name} disimpan` });
      onSaved();
      onClose();
    } catch (err) {
      notifications.show({ color: "red", message: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal opened={!!user} onClose={onClose} title={user ? `Paket ${user.name}` : ""} centered radius="lg">
      <Stack gap="md">
        <Select label="Paket" placeholder="Tanpa paket (tanpa batas)" clearable value={plan} onChange={pick}
          data={PLAN_IDS.map((id) => ({ value: id, label: `${PLAN_LABEL[id]} · ${describeLimits(id)}` }))} />
        <TextInput label="Berlaku sampai" type="date" value={until} onChange={(e) => setUntil(e.currentTarget.value)}
          description="Kosongkan bila tanpa batas waktu. Setelah tanggal ini kunci API pengguna berhenti bekerja." />
        <Switch label="Akun demo" description="Sembunyikan menu Paket & tagihan, chip paket, dan banner paket dari akun ini dan anggotanya." checked={demo} onChange={(e) => setDemo(e.currentTarget.checked)} />
        <Button variant="primary" onClick={save} loading={busy}>Simpan paket</Button>
      </Stack>
    </Modal>
  );
}

const today = (days: number) => new Date(Date.now() + days * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
type Kind = "main" | "sub" | "viewer";
const KIND_HELP: Record<Kind, string> = {
  main: "Akun utama klien: memegang paket, kuota, dan proyek klien.",
  sub: "Anggota klien: ikut paket dan status akun utamanya, hanya melihat proyek yang Anda pilihkan.",
  viewer: "Viewer: melihat seluruh data seperti admin, tanpa bisa mengubah apa pun.",
};

/** Create an account directly: active at once, no sign-up or approval. */
/** parentId: open as "Anggota klien" of that main account (the group's "Tambah anggota"). */
function CreateAccountModal({ opened, parentId, mains, onClose, onSaved }: { opened: boolean; parentId: string | null; mains: UserRow[]; onClose: () => void; onSaved: (account: UserRow, kind: Kind) => void }) {
  const [kind, setKind] = useState<Kind>("main");
  const [form, setForm] = useState({ name: "", username: "", password: "", parentId: null as string | null, plan: "trial" as string | null, until: today(TRIAL_DAYS), demo: false });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (opened) { setKind(parentId ? "sub" : "main"); setForm({ name: "", username: "", password: "", parentId, plan: "trial", until: today(TRIAL_DAYS), demo: false }); } }, [opened, parentId]);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const save = async () => {
    setBusy(true);
    try {
      const res = (await post("/api/admin/users", {
        name: form.name, username: form.username, password: form.password,
        role: kind === "viewer" ? "viewer" : "user",
        parentId: kind === "sub" ? form.parentId : null,
        plan: kind === "main" ? form.plan : null,
        expiresAt: kind === "main" && form.until ? form.until : null,
        demo: kind === "main" && form.demo,
      })) as { id: string };
      notifications.show({ color: "teal", message: `Akun ${form.name} dibuat` });
      const parent = kind === "sub" ? mains.find((m) => m.id === form.parentId) : undefined;
      onSaved({ id: res.id, name: form.name, parent: parent ? { ...parent, plan: parent.plan } : null } as UserRow, kind);
    } catch (err) {
      notifications.show({ color: "red", message: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const ready = form.name.trim().length >= 2 && form.username.trim().length >= 3 && form.password.length >= 8 && (kind !== "sub" || !!form.parentId);
  return (
    <Modal opened={opened} onClose={onClose} title="Tambah pengguna" centered radius="lg" size="md">
      <Stack gap="md">
        <div>
          <SegmentedControl fullWidth value={kind} onChange={(v) => setKind(v as Kind)}
            data={[{ value: "main", label: "Akun utama klien" }, { value: "sub", label: "Anggota klien" }, { value: "viewer", label: "Viewer" }]} />
          <p className={classes.formHelp}>{KIND_HELP[kind]}</p>
        </div>
        {kind === "sub" && (
          <Select label="Akun utama klien" placeholder={mains.length ? "Pilih klien" : "Belum ada akun utama klien"} searchable value={form.parentId}
            onChange={(v) => set({ parentId: v })} data={mains.map((m) => ({ value: m.id, label: `${m.name} (@${m.username})` }))} />
        )}
        <TextInput label="Nama" value={form.name} onChange={(e) => set({ name: e.currentTarget.value })} />
        <TextInput label="Username" description="3–30 karakter: huruf kecil, angka, titik, atau garis bawah" value={form.username}
          onChange={(e) => set({ username: e.currentTarget.value.toLowerCase() })} />
        <PasswordInput label="Kata sandi awal" description="Minimal 8 karakter. Sampaikan ke pengguna lewat jalur yang aman." value={form.password}
          onChange={(e) => set({ password: e.currentTarget.value })} />
        {kind === "main" && <>
          <Select label="Paket" placeholder="Tanpa paket (tanpa batas)" clearable value={form.plan}
            onChange={(v) => set({ plan: v, until: v === "trial" ? today(TRIAL_DAYS) : v ? today(30) : "" })}
            data={PLAN_IDS.map((id) => ({ value: id, label: `${PLAN_LABEL[id]} · ${describeLimits(id)}` }))} />
          <TextInput label="Berlaku sampai" type="date" value={form.until} onChange={(e) => set({ until: e.currentTarget.value })}
            description="Kosongkan bila tanpa batas waktu." />
          <Switch label="Akun demo" description="Menu Paket & tagihan disembunyikan dari klien ini dan anggotanya." checked={form.demo} onChange={(e) => set({ demo: e.currentTarget.checked })} />
        </>}
        <Button variant="primary" onClick={save} loading={busy} disabled={!ready}>Buat akun</Button>
      </Stack>
    </Modal>
  );
}

type ProjectOption = { id: string; name: string; keywords: string[]; selected: boolean };

/** Choose the projects of an account: what a main account owns, or which of its parent's projects a sub-account sees. */
function ProjectsModal({ user, onClose, onSaved }: { user: UserRow | null; onClose: () => void; onSaved: () => void }) {
  const data = useApi<{ kind: "main" | "sub"; projects: ProjectOption[] }>(user ? `/api/admin/users/${user.id}/projects` : null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setChosen(data.data?.projects.filter((p) => p.selected).map((p) => p.id) ?? []); }, [data.data]);
  const sub = data.data?.kind === "sub";
  const save = async () => {
    if (!user) return;
    setBusy(true);
    try {
      await post(`/api/admin/users/${user.id}/projects`, { projectIds: chosen }, "PUT");
      notifications.show({ color: "teal", message: `Proyek ${user.name} disimpan` });
      onSaved();
      onClose();
    } catch (err) {
      notifications.show({ color: "red", message: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal opened={!!user} onClose={onClose} title={user ? `Proyek ${user.name}` : ""} centered radius="lg" size="md">
      <Stack gap="md">
        <p className={classes.formHelp}>
          {sub ? `Pilih proyek ${user?.parent?.name ?? "akun utama"} yang boleh dilihat akun ini. Anggota hanya melihat data, tidak bisa mengubah atau menyalin kunci.`
            : "Proyek yang dicentang menjadi milik klien ini (paket dan kuotanya ikut klien). Yang tidak dicentang kembali dikelola admin. Proyek klien lain tidak ditampilkan."}
        </p>
        {!data.data ? <Skeleton h={120} radius="md" /> : data.data.projects.length ? (
          <Checkbox.Group value={chosen} onChange={setChosen}>
            <Stack gap={10}>
              {data.data.projects.map((p) => (
                <Checkbox key={p.id} value={p.id} label={<span className={classes.projectOption}><b>{p.name}</b><small>{p.keywords.length ? p.keywords.join(", ") : "semua data"}</small></span>} />
              ))}
            </Stack>
          </Checkbox.Group>
        ) : <span className={classes.muted}>{sub ? "Akun utama klien ini belum punya proyek." : "Tidak ada proyek admin yang bisa diberikan."}</span>}
        <Button variant="primary" onClick={save} loading={busy} disabled={!data.data}>Simpan proyek</Button>
      </Stack>
    </Modal>
  );
}

const describeLimits = (id: PlanId) => {
  const l = PLAN_LIMITS[id];
  return [`${l.keys ?? "∞"} proyek`, `${l.keywordsPerKey ?? "∞"} keyword`, l.historyDays ? `riwayat ${l.historyDays} hari` : "seluruh arsip"].join(", ");
};

const TABS: { id: Status; label: string }[] = [
  { id: "pending", label: "Menunggu" },
  { id: "active", label: "Aktif" },
  { id: "suspended", label: "Nonaktif" },
];
// Every row is its own grid, so every column needs a width that doesn't depend on its content (no "auto"),
// or the header and the rows drift apart. Status is left out: the tab already says it.
const COLUMNS = { ["--cols" as string]: "minmax(220px,1.6fr) minmax(170px,1.1fr) 90px 180px 330px" };

export function UserList() {
  const users = useApi<UserRow[]>("/api/admin/users");
  const [tab, setTab] = useState<Status>("active");
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [projectsOf, setProjectsOf] = useState<UserRow | null>(null);
  const [creating, setCreating] = useState<false | { parentId: string | null }>(false);
  const mains = users.data?.filter((u) => isMain(u) && u.status !== "pending") ?? [];
  // Each client is one group: its main account, then its sub-accounts (whatever their own status). The tabs go by the main
  // account's status, so a group never splits across tabs; viewers and plain accounts are groups of one.
  // Admins and viewers form one "Tim internal" group, always under Aktif (a suspended viewer stays in it, marked).
  type Group = { key: string; label?: string; status: Status; rows: UserRow[]; client?: UserRow };
  const all = users.data ?? [];
  const internal = all.filter((u) => u.role !== "user");
  const groups: Group[] = [
    ...(internal.length ? [{ key: "internal", label: "Tim internal", status: "active" as Status, rows: internal }] : []),
    ...all.filter(isMain).map((main) => ({ key: main.id, status: main.status, rows: [main, ...all.filter((u) => u.parentId === main.id)], client: main })),
  ];
  const count = (s: Status) => groups.filter((g) => g.status === s).reduce((n, g) => n + g.rows.length, 0);
  const shown = groups.filter((g) => g.status === tab);

  const act = async (user: UserRow, action: "approve" | "suspend" | "activate" | "reject") => {
    setBusy(user.id);
    try {
      if (action === "reject") await api(`/api/admin/users/${user.id}`, { method: "DELETE" });
      else await post(`/api/admin/users/${user.id}`, { action }, "PATCH");
      const done = { approve: "disetujui", suspend: "dinonaktifkan", activate: "diaktifkan kembali", reject: "ditolak" }[action];
      notifications.show({ color: action === "reject" || action === "suspend" ? "orange" : "teal", message: `${user.name} ${done}` });
      users.reload();
    } catch (err) {
      notifications.show({ color: "red", message: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const renderRow = (u: UserRow, subs = 0) => {
    const working = busy === u.id;
    return (
          <div key={u.id} className={classes.row} role="row" style={COLUMNS} data-sub={u.parentId ? true : undefined}>
            <div className={classes.nameCell} role="cell">
              <span className={classes.icon} data-kind={u.role === "user" ? (u.parentId ? "sub" : undefined) : u.role}>{u.name.charAt(0).toUpperCase()}</span>
              <span className={classes.name}>
                <b>{u.name}{u.self && <span className={classes.muted}> (Anda)</span>}</b>
                <code>@{u.username}{u.role !== "user" ? ` · ${u.role}` : u.parentId ? " · anggota" : subs ? ` · akun utama · ${subs} anggota` : ""}{(u.parentId || u.role === "viewer") && u.status === "suspended" ? " · nonaktif" : ""}</code>
              </span>
            </div>
            <div className={classes.cell} role="cell"><PlanCell user={u} /></div>
            <div className={classes.cell} role="cell">{u.keys ? u.keys : <span className={classes.muted}>—</span>}</div>
            <div className={classes.cell} role="cell" title={new Date(u.createdAt).toLocaleString("id-ID")}>{fromNow(u.createdAt)}</div>
            <div className={classes.actions} role="cell">
              {u.role !== "admin" && <ButtonGroup>
                {u.status === "pending" && <>
                  <Button size="sm" variant="primary" icon={IconCheck} loading={working} onClick={() => act(u, "approve")}>Setujui</Button>
                  <Button size="sm" variant="subtle" icon={IconX} disabled={working} onClick={() => act(u, "reject")}>Tolak</Button>
                </>}
                {u.status !== "pending" && u.role === "user" && <Button size="sm" variant="subtle" icon={IconFolders} onClick={() => setProjectsOf(u)}>Proyek</Button>}
                {u.status !== "pending" && isMain(u) && <Button size="sm" variant="subtle" icon={IconCreditCard} onClick={() => setEditing(u)}>Paket</Button>}
                {u.status === "active" && <Button size="sm" variant="secondary" icon={IconPlayerPause} loading={working} onClick={() => act(u, "suspend")}>Nonaktifkan</Button>}
                {u.status === "suspended" && <Button size="sm" variant="secondary" icon={IconPlayerPlay} loading={working} onClick={() => act(u, "activate")}>Aktifkan</Button>}
              </ButtonGroup>}
            </div>
          </div>
    );
  };

  return (
    <div className={classes.page}>
      <header className={classes.hero}>
        <div className={classes.heroGrid} aria-hidden />
        <div className={classes.heroText}>
          <span className={classes.badge}><IconUsers size={13} />Akun user</span>
          <h1>Peng<em>guna</em></h1>
          <p>Buat akun klien, anggotanya, atau viewer, dan pilih proyek tiap akun. Pendaftar baru menunggu di sini sampai disetujui. Akun yang dinonaktifkan tidak bisa masuk; anggota klien ikut nonaktif bila akun utamanya dinonaktifkan.</p>
        </div>
        <div className={classes.heroSide}>
          <div className={classes.stats}>
            {TABS.map((t) => <div key={t.id}><b>{users.data ? count(t.id) : "—"}</b><span>{t.label}</span></div>)}
          </div>
          <Button variant="primary" icon={IconPlus} onClick={() => setCreating({ parentId: null })}>Tambah pengguna</Button>
        </div>
      </header>

      <section className={classes.list} role="table" aria-label="Daftar pengguna">
        <div className={classes.toolbar}>
          <div className={classes.tabs} role="tablist">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} data-active={tab === t.id || undefined} onClick={() => setTab(t.id)}>
                {t.label}<span>{count(t.id)}</span>
              </button>
            ))}
          </div>
          {tab !== "pending" && count("pending") > 0 && (
            <button type="button" className={classes.pendingNote} onClick={() => setTab("pending")}>
              <IconClockHour4 size={15} />{count("pending")} pendaftar menunggu persetujuan<IconArrowRight size={14} />
            </button>
          )}
        </div>

        <div className={classes.head} role="row" style={COLUMNS}>
          <span role="columnheader">Pengguna</span><span role="columnheader">Paket</span><span role="columnheader">Proyek</span>
          <span role="columnheader">Mendaftar</span><span role="columnheader">Aksi</span>
        </div>

        {!users.data ? (
          Array.from({ length: 3 }, (_, i) => <div key={i} className={classes.skeletonRow}><Skeleton h={22} radius="md" /></div>)
        ) : shown.length ? shown.map(({ key, label, rows, client }) => (
          <div key={key} className={classes.group} data-client={client ? true : undefined} data-internal={label ? true : undefined}>
            {label && <div className={classes.groupLabel}>{label}<span>{rows.length}</span></div>}
            {rows.map((u) => renderRow(u, u === client ? rows.length - 1 : 0))}
            {client && client.status === "active" && rows.length > 1 && (
              <button type="button" className={classes.addMember} onClick={() => setCreating({ parentId: client.id })}><IconPlus size={13} />Tambah anggota {client.name}</button>
            )}
          </div>
        )) : (
          <div className={classes.empty}>
            <IconUserPlus size={24} />
            <b>{tab === "pending" ? "Tidak ada pendaftaran yang menunggu" : tab === "active" ? "Belum ada user aktif" : "Tidak ada akun nonaktif"}</b>
          </div>
        )}
      </section>
      <InvoiceAdmin accounts={users.data?.filter(isMain) ?? []} onPlanChanged={users.reload} />
      <ContactRequests />
      <PlanModal user={editing} onClose={() => setEditing(null)} onSaved={users.reload} />
      <ProjectsModal user={projectsOf} onClose={() => setProjectsOf(null)} onSaved={users.reload} />
      <CreateAccountModal opened={!!creating} parentId={creating ? creating.parentId : null} mains={mains} onClose={() => setCreating(false)} onSaved={(account, kind) => {
        setCreating(false);
        setTab("active");
        users.reload();
        // A new client or member usually needs projects next.
        if (kind !== "viewer") setProjectsOf(account);
      }} />
    </div>
  );
}
