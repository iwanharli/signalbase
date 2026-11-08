"use client";
// Admin page for user accounts: approve or reject sign-ups, suspend or re-activate accounts.
import { useState } from "react";
import { Skeleton } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconPlayerPause, IconPlayerPlay, IconUserPlus, IconUsers, IconX } from "@tabler/icons-react";
import { api, post } from "@/lib/api-client";
import { useApi } from "@/lib/useApi";
import { fromNow } from "../apiKeys/shared";
import { Button, ButtonGroup, StatusPill } from "../ui/Button";
import classes from "../apiKeys/apiKeyList.module.css";

type Status = "pending" | "active" | "suspended";
type UserRow = { id: string; name: string; username: string; status: Status; createdAt: string; keys: number };

const TABS: { id: Status; label: string }[] = [
  { id: "pending", label: "Menunggu" },
  { id: "active", label: "Aktif" },
  { id: "suspended", label: "Nonaktif" },
];
const STATUS_PILL = { pending: ["warning", "Menunggu"], active: ["success", "Aktif"], suspended: ["danger", "Nonaktif"] } as const;
const COLUMNS = { ["--cols" as string]: "minmax(0,1.6fr) minmax(0,.8fr) minmax(0,.7fr) minmax(0,.9fr) auto" };

export function UserList() {
  const users = useApi<UserRow[]>("/api/admin/users");
  const [tab, setTab] = useState<Status>("pending");
  const [busy, setBusy] = useState<string | null>(null);
  const count = (s: Status) => users.data?.filter((u) => u.status === s).length ?? 0;
  const rows = users.data?.filter((u) => u.status === tab) ?? [];

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

  return (
    <div className={classes.page}>
      <header className={classes.hero}>
        <div className={classes.heroGrid} aria-hidden />
        <div className={classes.heroText}>
          <span className={classes.badge}><IconUsers size={13} />Akun user</span>
          <h1>Peng<em>guna</em></h1>
          <p>Pendaftar baru menunggu di sini sampai disetujui. Akun yang dinonaktifkan tidak bisa masuk, dan kunci API miliknya berhenti bekerja sampai diaktifkan lagi.</p>
        </div>
        <div className={classes.heroSide}>
          <div className={classes.stats}>
            {TABS.map((t) => <div key={t.id}><b>{users.data ? count(t.id) : "—"}</b><span>{t.label}</span></div>)}
          </div>
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
        </div>

        <div className={classes.head} role="row" style={COLUMNS}>
          <span role="columnheader">Pengguna</span><span role="columnheader">Status</span><span role="columnheader">Kunci API</span>
          <span role="columnheader">Mendaftar</span><span role="columnheader">Aksi</span>
        </div>

        {!users.data ? (
          Array.from({ length: 3 }, (_, i) => <div key={i} className={classes.skeletonRow}><Skeleton h={22} radius="md" /></div>)
        ) : rows.length ? rows.map((u) => {
          const [tone, label] = STATUS_PILL[u.status];
          const working = busy === u.id;
          return (
            <div key={u.id} className={classes.row} role="row" style={COLUMNS}>
              <div className={classes.nameCell} role="cell">
                <span className={classes.icon}>{u.name.charAt(0).toUpperCase()}</span>
                <span className={classes.name}><b>{u.name}</b><code>@{u.username}</code></span>
              </div>
              <div className={classes.cell} role="cell"><StatusPill tone={tone}>{label}</StatusPill></div>
              <div className={classes.cell} role="cell">{u.keys ? u.keys : <span className={classes.muted}>—</span>}</div>
              <div className={classes.cell} role="cell">{fromNow(u.createdAt)}</div>
              <div className={classes.actions} role="cell">
                <ButtonGroup>
                  {u.status === "pending" && <>
                    <Button size="sm" variant="primary" icon={IconCheck} loading={working} onClick={() => act(u, "approve")}>Setujui</Button>
                    <Button size="sm" variant="subtle" icon={IconX} disabled={working} onClick={() => act(u, "reject")}>Tolak</Button>
                  </>}
                  {u.status === "active" && <Button size="sm" variant="secondary" icon={IconPlayerPause} loading={working} onClick={() => act(u, "suspend")}>Nonaktifkan</Button>}
                  {u.status === "suspended" && <Button size="sm" variant="secondary" icon={IconPlayerPlay} loading={working} onClick={() => act(u, "activate")}>Aktifkan</Button>}
                </ButtonGroup>
              </div>
            </div>
          );
        }) : (
          <div className={classes.empty}>
            <IconUserPlus size={24} />
            <b>{tab === "pending" ? "Tidak ada pendaftaran yang menunggu" : tab === "active" ? "Belum ada user aktif" : "Tidak ada akun nonaktif"}</b>
          </div>
        )}
      </section>
    </div>
  );
}
