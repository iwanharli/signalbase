"use client";
// Admin: sales enquiries sent from /kontak, open ones first.
import { Skeleton } from "@mantine/core";
import { IconCheck, IconMail, IconRotate } from "@tabler/icons-react";
import { post } from "@/lib/api-client";
import { PLAN_LABEL, isPlanId } from "@/lib/plans";
import { useApi } from "@/lib/useApi";
import { fromNow } from "../apiKeys/shared";
import { Button, StatusPill } from "../ui/Button";
import classes from "./contactRequests.module.css";

type Request = { id: string; name: string; organization: string; email: string; phone: string | null; plan: string | null; message: string; handled: boolean; createdAt: string };

export function ContactRequests() {
  const list = useApi<Request[]>("/api/admin/contact");
  const toggle = async (r: Request) => { await post(`/api/admin/contact/${r.id}`, { handled: !r.handled }, "PATCH"); list.reload(); };
  const open = list.data?.filter((r) => !r.handled).length ?? 0;
  return (
    <section className={classes.box}>
      <header><h2><IconMail size={18} />Permintaan kontak</h2>{list.data && <StatusPill tone={open ? "warning" : "neutral"}>{open} belum ditangani</StatusPill>}</header>
      {!list.data ? <Skeleton h={60} radius="md" /> : !list.data.length ? <p className={classes.empty}>Belum ada permintaan dari halaman kontak.</p> : (
        <div className={classes.list}>
          {list.data.map((r) => (
            <article key={r.id} data-handled={r.handled || undefined}>
              <div className={classes.head}>
                <b>{r.name}</b><span>{r.organization}</span>
                {isPlanId(r.plan) && <StatusPill tone="info">{PLAN_LABEL[r.plan]}</StatusPill>}
                <small>{fromNow(r.createdAt)}</small>
              </div>
              <p>{r.message}</p>
              <div className={classes.foot}>
                <a href={`mailto:${r.email}`}>{r.email}</a>
                {r.phone && <a href={`https://wa.me/${r.phone.replace(/\D/g, "").replace(/^0/, "62")}`} target="_blank" rel="noreferrer">{r.phone}</a>}
                <Button size="sm" variant={r.handled ? "subtle" : "secondary"} icon={r.handled ? IconRotate : IconCheck} onClick={() => toggle(r)}>{r.handled ? "Buka lagi" : "Tandai ditangani"}</Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
