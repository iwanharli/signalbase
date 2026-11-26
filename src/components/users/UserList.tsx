"use client";
// Admin page for accounts: create clients (Instansi) and viewers, approve or reject sign-ups (with the last day of access),
// suspend or re-activate accounts, change a client's last day of access, and give each client projects with its own API
// key per project. Clients only read the projects given to them; projects are set up by admins (Proyek).
import { useEffect, useState } from "react";
import { Checkbox, Modal, PasswordInput, SegmentedControl, Skeleton, Stack, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconArrowRight, IconCalendarTime, IconCheck, IconClockHour4, IconFolders, IconKey, IconKeyOff, IconPlayerPause, IconPlayerPlay, IconPlus, IconRefresh, IconUserPlus, IconUsers, IconX } from "@tabler/icons-react";
import { api, post } from "@/lib/api-client";
import { daysLeft } from "@/lib/plans";
import { useApi } from "@/lib/useApi";
import { fromNow } from "../apiKeys/shared";
import { CopyKeyButton } from "../apiKeys/CopyKeyButton";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Button, ButtonGroup, StatusPill } from "../ui/Button";
import classes from "../apiKeys/apiKeyList.module.css";
import u from "./users.module.css";
import { ContactRequests } from "./ContactRequests";
import { InvoiceAdmin } from "./InvoiceAdmin";

type Status = "pending" | "active" | "suspended";
type UserRow = {
  id: string; name: string; username: string; role: "admin" | "user" | "viewer"; status: Status; self: boolean; planExpiresAt: string | null;
  /** Sign-up details: the institution and what it wants monitored. */
  institution: string | null; requestedTopics: string | null; createdAt: string; projects: number;
};

const dateOf = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }) : "");
const plusMonths = (months: number, from?: string | null) => {
  const base = from && new Date(from).getTime() > Date.now() ? new Date(from) : new Date();
  base.setMonth(base.getMonth() + months);
  return base.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
};
const longDate = (date: string) => new Date(`${date}T12:00:00+07:00`).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

/** A client's access: "Aktif · sisa 12 hari", "Berakhir", "Tanpa batas waktu"; for a sign-up, what it asked for. */
function AccessCell({ user }: { user: UserRow }) {
  if (user.role === "admin") return <span className={classes.muted}>Admin · akses penuh</span>;
  if (user.role === "viewer") return <span className={classes.muted}>Viewer · lihat semua data</span>;
  if (user.status === "pending") {
    return <span className={classes.aiCell}><b className={u.institution}>{user.institution ?? "Instansi belum diisi"}</b><small title={user.requestedTopics ?? ""}>{user.requestedTopics ? `Pantau: ${user.requestedTopics}` : "Topik belum diisi"}</small></span>;
  }
  const left = daysLeft(user.planExpiresAt);
  const tone = left === null ? "success" : left <= 0 ? "danger" : left <= 7 ? "warning" : "info";
  const label = left === null ? "Tanpa batas" : left <= 0 ? "Berakhir" : "Aktif";
  const note = left === null ? "tanpa batas waktu" : left <= 0 ? `sejak ${longDate(dateOf(user.planExpiresAt))}` : `s.d. ${longDate(dateOf(user.planExpiresAt))} · sisa ${left} hari`;
  return <span className={classes.aiCell}><StatusPill tone={tone}>{label}</StatusPill><small>{note}</small></span>;
}

/** The last day of a client's access: approving a sign-up, or changing it later. Invoices marked paid extend it too. */
function AccessModal({ target, onClose, onSaved }: { target: { user: UserRow; approve: boolean } | null; onClose: () => void; onSaved: () => void }) {
  const [until, setUntil] = useState("");
  const [busy, setBusy] = useState(false);
  const user = target?.user;
  useEffect(() => { if (target) setUntil(target.approve ? plusMonths(1) : dateOf(target.user.planExpiresAt)); }, [target]);
  const save = async () => {
    if (!target || !user) return;
    setBusy(true);
    try {
      await post(`/api/admin/users/${user.id}`, target.approve ? { action: "approve", expiresAt: until || null } : { action: "setExpiry", expiresAt: until || null }, "PATCH");
      notifications.show({ color: "teal", message: target.approve ? `${user.name} disetujui` : `Masa akses ${user.name} disimpan` });
      onSaved();
      onClose();
    } catch (err) {
      notifications.show({ color: "red", message: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal opened={!!target} onClose={onClose} title={user ? (target?.approve ? `Setujui ${user.name}` : `Masa akses ${user.name}`) : ""} centered radius="lg">
      <Stack gap="md">
        {target?.approve && user && (
          <div className={u.signup}>
            <span><small>Instansi</small><b>{user.institution ?? "—"}</b></span>
            <span><small>Ingin memantau</small><b>{user.requestedTopics ?? "—"}</b></span>
          </div>
        )}
        <TextInput label="Akses berlaku sampai" type="date" value={until} onChange={(e) => setUntil(e.currentTarget.value)}
          description="Setelah tanggal ini klien tidak bisa membuka data proyeknya dan kunci API-nya berhenti. Kosongkan bila tanpa batas waktu." />
        <div className={u.quick}>
          {[[1, "+1 bulan"], [3, "+3 bulan"], [6, "+6 bulan"], [12, "+1 tahun"]].map(([m, label]) => (
            <button key={label} type="button" onClick={() => setUntil(plusMonths(m as number, target?.approve ? null : user?.planExpiresAt))}>{label}</button>
          ))}
          <button type="button" onClick={() => setUntil("")}>Tanpa batas</button>
        </div>
        <Button variant="primary" onClick={save} loading={busy}>{target?.approve ? "Setujui dan aktifkan" : "Simpan masa akses"}</Button>
        {target?.approve && <p className={classes.formHelp}>Setelah disetujui, buat proyeknya di halaman Proyek lalu berikan ke klien ini lewat tombol Proyek.</p>}
      </Stack>
    </Modal>
  );
}

type Kind = "client" | "viewer";
const KIND_HELP: Record<Kind, string> = {
  client: "Klien (Instansi): hanya melihat data proyek yang Anda berikan, sampai masa aksesnya berakhir.",
  viewer: "Viewer: melihat seluruh data seperti admin, tanpa bisa mengubah apa pun.",
};

/** Create an account directly: active at once, no sign-up or approval. */
function CreateAccountModal({ opened, onClose, onSaved }: { opened: boolean; onClose: () => void; onSaved: (account: UserRow, kind: Kind) => void }) {
  const [kind, setKind] = useState<Kind>("client");
  const [form, setForm] = useState({ name: "", username: "", password: "", institution: "", until: plusMonths(1) });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (opened) { setKind("client"); setForm({ name: "", username: "", password: "", institution: "", until: plusMonths(1) }); } }, [opened]);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const save = async () => {
    setBusy(true);
    try {
      const client = kind === "client";
      const res = (await post("/api/admin/users", {
        name: form.name, username: form.username, password: form.password, role: client ? "user" : "viewer",
        institution: client ? form.institution.trim() || null : null, expiresAt: client && form.until ? form.until : null,
      })) as { id: string };
      notifications.show({ color: "teal", message: `Akun ${form.name} dibuat` });
      onSaved({ id: res.id, name: form.name } as UserRow, kind);
    } catch (err) {
      notifications.show({ color: "red", message: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const ready = form.name.trim().length >= 2 && form.username.trim().length >= 3 && form.password.length >= 8;
  return (
    <Modal opened={opened} onClose={onClose} title="Tambah pengguna" centered radius="lg" size="md">
      <Stack gap="md">
        <div>
          <SegmentedControl fullWidth value={kind} onChange={(v) => setKind(v as Kind)} data={[{ value: "client", label: "Klien" }, { value: "viewer", label: "Viewer" }]} />
          <p className={classes.formHelp}>{KIND_HELP[kind]}</p>
        </div>
        <TextInput label="Nama" value={form.name} onChange={(e) => set({ name: e.currentTarget.value })} />
        {kind === "client" && <TextInput label="Instansi" placeholder="mis. SLOG POLRI" value={form.institution} onChange={(e) => set({ institution: e.currentTarget.value })} />}
        <TextInput label="Username" description="3–30 karakter: huruf kecil, angka, titik, atau garis bawah" value={form.username}
          onChange={(e) => set({ username: e.currentTarget.value.toLowerCase() })} />
        <PasswordInput label="Kata sandi awal" description="Minimal 8 karakter. Sampaikan ke pengguna lewat jalur yang aman." value={form.password}
          onChange={(e) => set({ password: e.currentTarget.value })} />
        {kind === "client" && (
          <TextInput label="Akses berlaku sampai" type="date" value={form.until} onChange={(e) => set({ until: e.currentTarget.value })} description="Kosongkan bila tanpa batas waktu." />
        )}
        <Button variant="primary" onClick={save} loading={busy} disabled={!ready}>Buat akun</Button>
      </Stack>
    </Modal>
  );
}

type ProjectAccess = {
  id: string; name: string; keywords: string[]; clients: number;
  access: { since: string; keyPrefix: string | null; keyCreatedAt: string | null; keyLastUsedAt: string | null; keyRevokedAt: string | null; copyable: boolean; callsToday: number; calls30: number } | null;
};

/** The client's projects (tick to give, untick to take away) and its API key for each given project. */
function ProjectsModal({ user, onClose, onSaved }: { user: UserRow | null; onClose: () => void; onSaved: () => void }) {
  const data = useApi<{ projects: ProjectAccess[] }>(user ? `/api/admin/users/${user.id}/projects` : null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ project: ProjectAccess; action: "rotate" | "revoke" } | null>(null);
  useEffect(() => { setChosen(data.data?.projects.filter((p) => p.access).map((p) => p.id) ?? []); }, [data.data]);
  const given = new Set(data.data?.projects.filter((p) => p.access).map((p) => p.id));
  const changed = chosen.length !== given.size || chosen.some((id) => !given.has(id));
  const save = async () => {
    if (!user) return;
    setBusy("save");
    try {
      await post(`/api/admin/users/${user.id}/projects`, { projectIds: chosen }, "PUT");
      notifications.show({ color: "teal", message: `Proyek ${user.name} disimpan` });
      data.reload();
      onSaved();
    } catch (err) {
      notifications.show({ color: "red", message: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };
  const keyAction = async () => {
    if (!user || !confirm) return;
    setBusy(confirm.project.id);
    try {
      await post(`/api/admin/users/${user.id}/projects/${confirm.project.id}`, { action: confirm.action });
      notifications.show({ color: confirm.action === "rotate" ? "teal" : "orange", message: confirm.action === "rotate" ? `Kunci baru untuk ${confirm.project.name} dibuat` : `Kunci ${confirm.project.name} dicabut` });
      setConfirm(null);
      data.reload();
    } catch (err) {
      notifications.show({ color: "red", message: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };
  return (
    <Modal opened={!!user} onClose={onClose} title={user ? `Proyek ${user.name}` : ""} centered radius="lg" size="xl">
      <Stack gap="md">
        <p className={classes.formHelp}>
          Centang proyek yang boleh dilihat klien ini (hanya lihat). Setiap proyek yang diberikan punya kunci API sendiri untuk klien ini; kuncinya hanya terlihat oleh admin, untuk dipasang di aplikasi klien. Kunci berhenti saat masa akses klien berakhir atau dicabut.
        </p>
        {!data.data ? <Skeleton h={160} radius="md" /> : data.data.projects.length ? (
          <Checkbox.Group value={chosen} onChange={setChosen}>
            <div className={u.projects}>
              {data.data.projects.map((p) => {
                const a = p.access;
                return (
                  <div key={p.id} className={u.project} data-given={a ? true : undefined}>
                    <Checkbox value={p.id} label={<span className={classes.projectOption}><b>{p.name}</b><small>{p.keywords.length ? p.keywords.join(", ") : "semua data"} · {p.clients} klien</small></span>} />
                    {a && (
                      <div className={u.key}>
                        <span className={u.keyInfo}>
                          <IconKey size={14} />
                          {a.keyRevokedAt ? <StatusPill tone="danger">Kunci dicabut</StatusPill> : <code>{a.keyPrefix}…</code>}
                          <small>{a.keyLastUsedAt ? `dipakai ${fromNow(a.keyLastUsedAt)}` : "belum pernah dipakai"} · {a.callsToday.toLocaleString("id-ID")} panggilan hari ini · {a.calls30.toLocaleString("id-ID")} dalam 30 hari</small>
                        </span>
                        <ButtonGroup>
                          {!a.keyRevokedAt && <CopyKeyButton keyId={p.id} secretUrl={`/api/admin/users/${user!.id}/projects/${p.id}/secret`} copyable={a.copyable} label="Salin kunci" />}
                          <Button size="sm" variant="subtle" icon={IconRefresh} loading={busy === p.id && confirm?.action === "rotate"} onClick={() => setConfirm({ project: p, action: "rotate" })}>{a.keyRevokedAt ? "Buat kunci baru" : "Putar"}</Button>
                          {!a.keyRevokedAt && <Button size="sm" variant="subtle" icon={IconKeyOff} onClick={() => setConfirm({ project: p, action: "revoke" })}>Cabut</Button>}
                        </ButtonGroup>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Checkbox.Group>
        ) : <span className={classes.muted}>Belum ada proyek. Buat dulu di halaman Proyek.</span>}
        <Button variant="primary" onClick={save} loading={busy === "save"} disabled={!data.data || !changed}>Simpan proyek</Button>
      </Stack>
      <ConfirmDialog opened={!!confirm} onClose={() => setConfirm(null)} onConfirm={keyAction} loading={!!busy && busy !== "save"}
        icon={confirm?.action === "revoke" ? IconKeyOff : IconRefresh} tone={confirm?.action === "revoke" ? "danger" : "warning"}
        title={confirm?.action === "revoke" ? "Cabut kunci API?" : "Buat kunci API baru?"}
        description={confirm ? (confirm.action === "revoke"
          ? `Aplikasi ${user?.name} yang memakai kunci ${confirm.project.name} langsung berhenti mendapat data. Klien tetap bisa melihat proyek di panel.`
          : `Kunci lama ${user?.name} untuk ${confirm.project.name} langsung berhenti bekerja; pasang kunci baru di aplikasi klien.`) : ""}
        confirmLabel={confirm?.action === "revoke" ? "Cabut kunci" : "Buat kunci baru"} />
    </Modal>
  );
}

const TABS: { id: Status; label: string }[] = [
  { id: "pending", label: "Menunggu" },
  { id: "active", label: "Aktif" },
  { id: "suspended", label: "Nonaktif" },
];
// Every row is its own grid, so every column needs a width that doesn't depend on its content (no "auto"),
// or the header and the rows drift apart. Status is left out: the tab already says it.
const COLUMNS = { ["--cols" as string]: "minmax(220px,1.4fr) minmax(220px,1.4fr) 80px 150px 330px" };

export function UserList() {
  const users = useApi<UserRow[]>("/api/admin/users");
  const [tab, setTab] = useState<Status>("active");
  const [busy, setBusy] = useState<string | null>(null);
  const [accessOf, setAccessOf] = useState<{ user: UserRow; approve: boolean } | null>(null);
  const [projectsOf, setProjectsOf] = useState<UserRow | null>(null);
  const [creating, setCreating] = useState(false);
  // Admins and viewers form one "Tim internal" group, always under Aktif (a suspended viewer stays in it, marked).
  const all = users.data ?? [];
  const internal = all.filter((x) => x.role !== "user");
  const clients = all.filter((x) => x.role === "user");
  const count = (s: Status) => clients.filter((c) => c.status === s).length + (s === "active" ? internal.length : 0);
  const shownClients = clients.filter((c) => c.status === tab);

  const act = async (user: UserRow, action: "suspend" | "activate" | "reject") => {
    setBusy(user.id);
    try {
      if (action === "reject") await api(`/api/admin/users/${user.id}`, { method: "DELETE" });
      else await post(`/api/admin/users/${user.id}`, { action }, "PATCH");
      const done = { suspend: "dinonaktifkan", activate: "diaktifkan kembali", reject: "ditolak" }[action];
      notifications.show({ color: action === "activate" ? "teal" : "orange", message: `${user.name} ${done}` });
      users.reload();
    } catch (err) {
      notifications.show({ color: "red", message: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const renderRow = (x: UserRow) => {
    const working = busy === x.id;
    const client = x.role === "user";
    return (
      <div key={x.id} className={classes.row} role="row" style={COLUMNS}>
        <div className={classes.nameCell} role="cell">
          <span className={classes.icon} data-kind={client ? undefined : x.role}>{x.name.charAt(0).toUpperCase()}</span>
          <span className={classes.name}>
            <b>{x.name}{x.self && <span className={classes.muted}> (Anda)</span>}</b>
            <code>@{x.username}{!client ? ` · ${x.role}` : x.institution && x.status !== "pending" ? ` · ${x.institution}` : ""}{x.role === "viewer" && x.status === "suspended" ? " · nonaktif" : ""}</code>
          </span>
        </div>
        <div className={classes.cell} role="cell"><AccessCell user={x} /></div>
        <div className={classes.cell} role="cell">{client && x.status !== "pending" ? (x.projects || <span className={classes.muted}>—</span>) : <span className={classes.muted}>—</span>}</div>
        <div className={classes.cell} role="cell" title={new Date(x.createdAt).toLocaleString("id-ID")}>{fromNow(x.createdAt)}</div>
        <div className={classes.actions} role="cell">
          {x.role !== "admin" && <ButtonGroup>
            {x.status === "pending" && <>
              <Button size="sm" variant="primary" icon={IconCheck} onClick={() => setAccessOf({ user: x, approve: true })}>Setujui</Button>
              <Button size="sm" variant="subtle" icon={IconX} loading={working} onClick={() => act(x, "reject")}>Tolak</Button>
            </>}
            {x.status !== "pending" && client && <Button size="sm" variant="subtle" icon={IconFolders} onClick={() => setProjectsOf(x)}>Proyek</Button>}
            {x.status !== "pending" && client && <Button size="sm" variant="subtle" icon={IconCalendarTime} onClick={() => setAccessOf({ user: x, approve: false })}>Masa akses</Button>}
            {x.status === "active" && <Button size="sm" variant="secondary" icon={IconPlayerPause} loading={working} onClick={() => act(x, "suspend")}>Nonaktifkan</Button>}
            {x.status === "suspended" && <Button size="sm" variant="secondary" icon={IconPlayerPlay} loading={working} onClick={() => act(x, "activate")}>Aktifkan</Button>}
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
          <span className={classes.badge}><IconUsers size={13} />Akun</span>
          <h1>Peng<em>guna</em></h1>
          <p>Klien Instansi melihat data proyek yang Anda berikan sampai masa aksesnya berakhir; masing-masing punya kunci API sendiri per proyek. Pendaftar baru menunggu di sini sampai disetujui.</p>
        </div>
        <div className={classes.heroSide}>
          <div className={classes.stats}>
            {TABS.map((t) => <div key={t.id}><b>{users.data ? count(t.id) : "—"}</b><span>{t.label}</span></div>)}
          </div>
          <Button variant="primary" icon={IconPlus} onClick={() => setCreating(true)}>Tambah pengguna</Button>
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
          <span role="columnheader">Pengguna</span><span role="columnheader">{tab === "pending" ? "Permintaan" : "Masa akses"}</span><span role="columnheader">Proyek</span>
          <span role="columnheader">Mendaftar</span><span role="columnheader">Aksi</span>
        </div>

        {!users.data ? (
          Array.from({ length: 3 }, (_, i) => <div key={i} className={classes.skeletonRow}><Skeleton h={22} radius="md" /></div>)
        ) : (tab === "active" && internal.length) || shownClients.length ? <>
          {tab === "active" && internal.length > 0 && (
            <div className={classes.group} data-internal>
              <div className={classes.groupLabel}>Tim internal<span>{internal.length}</span></div>
              {internal.map(renderRow)}
            </div>
          )}
          {shownClients.length > 0 && (
            <div className={classes.group}>
              {tab === "active" && <div className={classes.groupLabel}>Klien<span>{shownClients.length}</span></div>}
              {shownClients.map(renderRow)}
            </div>
          )}
        </> : (
          <div className={classes.empty}>
            <IconUserPlus size={24} />
            <b>{tab === "pending" ? "Tidak ada pendaftaran yang menunggu" : tab === "active" ? "Belum ada klien aktif" : "Tidak ada akun nonaktif"}</b>
          </div>
        )}
      </section>
      <InvoiceAdmin accounts={clients} onPlanChanged={users.reload} />
      <ContactRequests />
      <AccessModal target={accessOf} onClose={() => setAccessOf(null)} onSaved={users.reload} />
      <ProjectsModal user={projectsOf} onClose={() => setProjectsOf(null)} onSaved={users.reload} />
      <CreateAccountModal opened={creating} onClose={() => setCreating(false)} onSaved={(account, kind) => {
        setCreating(false);
        setTab("active");
        users.reload();
        // A new client usually needs projects next.
        if (kind === "client") setProjectsOf(account);
      }} />
    </div>
  );
}
