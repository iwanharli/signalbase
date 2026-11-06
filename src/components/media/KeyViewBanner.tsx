"use client";
// Shown above the media browser when it is opened through one API key (?key=):
// which key, what it can read, and a way back to the whole bank.
import { IconEye, IconKey, IconMessages, IconRobot, IconWorldWww, IconX } from "@tabler/icons-react";
import type { KeyScope } from "@/lib/media/keyScope";
import { allowsType } from "@/lib/media/keyScope";
import { MEDIA_TYPE_LABEL } from "@/lib/media/labels";
import { MEDIA_TYPES, type MediaType } from "@/lib/media/types";
import { keywordText, scopeRestrictions, useProvinceNames } from "../apiKeys/shared";
import { Button } from "../ui/Button";
import classes from "./keyView.module.css";
import { Tip } from "../ui/Tip";

export type KeyView = { id: string; name: string; scope: KeyScope; aiEnabled: boolean };

const TYPE_ICON = { social: IconMessages, online: IconWorldWww } as const;

export function KeyViewBanner({ view, type }: { view: KeyView; type: MediaType }) {
  const provinceName = useProvinceNames();
  const restrictions = scopeRestrictions(view.scope, provinceName);

  return (
    <section className={classes.banner}>
      <span className={classes.icon}><IconEye size={18} /></span>
      <div className={classes.body}>
        <span className={classes.eyebrow}><IconKey size={12} />Dilihat sebagai kunci</span>
        <b>{view.name}</b>
        <small>{keywordText(view.scope.keywords)}{restrictions.length ? ` · ${restrictions.join(" · ")}` : ""}{view.aiEnabled ? " · kategorisasi AI aktif" : ""}</small>
      </div>
      <nav className={classes.types} aria-label="Jenis media">
        {MEDIA_TYPES.map((t) => {
          const Icon = TYPE_ICON[t];
          const allowed = allowsType(view.scope, t);
          return allowed
            ? <a key={t} href={`/media/${t}?key=${view.id}`} data-active={t === type || undefined}><Icon size={14} />{MEDIA_TYPE_LABEL[t]}</a>
            : <Tip key={t} label="Tidak termasuk cakupan kunci ini"><span><Icon size={14} />{MEDIA_TYPE_LABEL[t]}</span></Tip>;
        })}
      </nav>
      <div className={classes.actions}>
        {view.aiEnabled && <Button size="sm" onDark variant="secondary" icon={IconRobot} href={`/api-keys/${view.id}/ai`}>AI</Button>}
        <Button size="sm" onDark variant="secondary" icon={IconKey} href={`/api-keys/${view.id}`}>Kunci</Button>
        <Button size="sm" onDark variant="subtle" icon={IconX} href={`/media/${type}`}>Keluar</Button>
      </div>
    </section>
  );
}
