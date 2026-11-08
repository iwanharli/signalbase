"use client";
// Admin page for user accounts: approve or reject sign-ups, suspend or re-activate accounts.
import { useEffect, useState } from "react";
import { Modal, Select, Skeleton, Stack, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconArrowRight, IconCheck, IconClockHour4, IconCreditCard, IconPlayerPause, IconPlayerPlay, IconUserPlus, IconUsers, IconX } from "@tabler/icons-react";
import { api, post } from "@/lib/api-client";
import { daysLeft, PLAN_IDS, PLAN_LABEL, PLAN_LIMITS, TRIAL_DAYS, type PlanId } from "@/lib/plans";
import { useApi } from "@/lib/useApi";
import { fromNow } from "../apiKeys/shared";
import { Button, ButtonGroup, StatusPill } from "../ui/Button";
import classes from "../apiKeys/apiKeyList.module.css";
import { ContactRequests } from "./ContactRequests";
import { InvoiceAdmin } from "./InvoiceAdmin";

type Status = "pending" | "active" | "suspended";
type UserRow = { id: string; name: string; username: string; status: Status; plan: PlanId | null; planExpiresAt: string | null; requestedPlan: PlanId | null; createdAt: string; keys: number };

/** "Trial · sisa 3 hari", "Pro · berakhir", or "Tanpa paket". */
function PlanCell({ user }: { user: UserRow }) {
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
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!user) return;
    setPlan(user.plan);
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
      await post(`/api/admin/users/${user.id}`, { action: "setPlan", plan, expiresAt: until || null }, "PATCH");
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
        <Button variant="primary" onClick={save} loading={busy}>Simpan paket</Button>
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
const COLUMNS = { ["--cols" as string]: "minmax(220px,1.6fr) minmax(170px,1.1fr) 90px 180px 250px" };

export function UserList() {
  const users = useApi<UserRow[]>("/api/admin/users");
  const [tab, setTab] = useState<Status>("active");
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<UserRow | null>(null);
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
        ) : rows.length ? rows.map((u) => {
          const working = busy === u.id;
          return (
            <div key={u.id} className={classes.row} role="row" style={COLUMNS}>
              <div className={classes.nameCell} role="cell">
                <span className={classes.icon}>{u.name.charAt(0).toUpperCase()}</span>
                <span className={classes.name}><b>{u.name}</b><code>@{u.username}</code></span>
              </div>
              <div className={classes.cell} role="cell"><PlanCell user={u} /></div>
              <div className={classes.cell} role="cell">{u.keys ? u.keys : <span className={classes.muted}>—</span>}</div>
              <div className={classes.cell} role="cell" title={new Date(u.createdAt).toLocaleString("id-ID")}>{fromNow(u.createdAt)}</div>
              <div className={classes.actions} role="cell">
                <ButtonGroup>
                  {u.status === "pending" && <>
                    <Button size="sm" variant="primary" icon={IconCheck} loading={working} onClick={() => act(u, "approve")}>Setujui</Button>
                    <Button size="sm" variant="subtle" icon={IconX} disabled={working} onClick={() => act(u, "reject")}>Tolak</Button>
                  </>}
                  {u.status !== "pending" && <Button size="sm" variant="subtle" icon={IconCreditCard} onClick={() => setEditing(u)}>Paket</Button>}
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
      <InvoiceAdmin accounts={users.data ?? []} onPlanChanged={users.reload} />
      <ContactRequests />
      <PlanModal user={editing} onClose={() => setEditing(null)} onSaved={users.reload} />
    </div>
  );
}
