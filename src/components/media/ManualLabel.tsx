"use client";
// Strip at the top of each card to give a post or article one or more of the project's labels (not AI categorisation).
// MediaBrowser provides the project's choices through ManualLabelContext; without a project, or without choices, nothing shows.
// Each choice keeps one colour (by its position in the project's list) on its pill; the strip itself stays one neutral colour.
import { createContext, useContext, useEffect, useState } from "react";
import { Loader, Menu } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconChevronDown, IconTag, IconX } from "@tabler/icons-react";
import { post } from "@/lib/api-client";
import { labelColor as colorOf } from "@/lib/media/manualLabels";
import { REVIEW_LABEL_SCORE } from "@/lib/ai/labelReply";
import type { MediaItem, MediaType } from "@/lib/media/types";
import classes from "./manualLabel.module.css";

/** onLabelled: lets the page re-render, so a label set in the detail modal shows on its card at once (and vice versa). */
export type ManualLabelContextValue = { keyId: string; type: MediaType; options: string[]; canLabel: boolean; onLabelled?: (code: string, labels: string[]) => void };
export const ManualLabelContext = createContext<ManualLabelContextValue | null>(null);


/** bleed: inside a padded box (the Original View shell), pulled out to its edges like the strip on a Quick card.
 *  panel: a rounded box of its own (the detail modal's side panel).
 *  leading: shown on the left in place of the "Label" caption (cards: the AI category), and alone when the project has no labels. */
export function ManualLabelPicker({ item, bleed, panel, leading }: { item: MediaItem; bleed?: boolean; panel?: boolean; leading?: React.ReactNode }) {
  const ctx = useContext(ManualLabelContext);
  const [values, setValues] = useState<string[]>(item.manualLabels ?? []);
  const [busy, setBusy] = useState(false);
  useEffect(() => setValues(item.manualLabels ?? []), [item.manualLabels]);
  if (!ctx || !ctx.options.length) {
    return leading ? <div className={classes.bar} data-bleed={bleed || undefined} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>{leading}</div> : null;
  }

  /** Puts one label on or takes it off; null clears them all. The server answers with the item's labels. */
  const change = async (label: string | null, on = false) => {
    setBusy(true);
    try {
      const { labels } = await post(`/api/admin/keys/${ctx.keyId}/item-labels`, { type: ctx.type, code: item.code, label, on }, "PUT") as { labels: string[] };
      setValues(labels);
      item.manualLabels = labels; // the feed shares this object, so the labels survive re-renders
      // A label a person just put on or took off is no longer the AI's.
      if (label === null) item.aiLabels = {};
      else if (item.aiLabels) delete item.aiLabels[label];
      ctx.onLabelled?.(item.code, labels);
    } catch (err) {
      notifications.show({ color: "red", message: `Label tidak tersimpan: ${(err as Error).message}` });
    } finally {
      setBusy(false);
    }
  };

  const tint = (option: string) => ({ ["--label" as string]: `var(--mantine-color-${colorOf(ctx.options, option)}-6)` });
  const set = values.length > 0;
  // The chevron (or the spinner while saving) sits inside the last pill, so it reads as one control.
  const tail = busy ? <Loader size={11} color="currentColor" /> : ctx.canLabel ? <IconChevronDown size={13} className={classes.chevron} /> : null;
  const pill = (
    <button type="button" className={classes.pills} disabled={!ctx.canLabel || busy}
      aria-label={set ? `Label: ${values.map((v) => (item.aiLabels?.[v] ? `${v} (dugaan AI ${item.aiLabels[v].score ?? "?"}%)` : v)).join(", ")}${ctx.canLabel ? ", ubah" : ""}` : "Beri label"}>
      {set ? values.map((value, n) => {
        const fromAi = item.aiLabels?.[value];
        const unsure = !!fromAi && (fromAi.needsReview ?? (fromAi.score ?? 0) < REVIEW_LABEL_SCORE);
        return (
          <span key={value} className={classes.pill} data-set style={tint(value)} title={fromAi ? `Dugaan AI ${fromAi.score ?? "?"}%${unsure ? " · perlu diperiksa" : ""}${fromAi.reason ? ` — ${fromAi.reason}` : ""}` : undefined}>
            <i className={classes.dot} /><span>{value}</span>
            {/* AI guess: a small tag with its score; dashed when it still needs a person to check it. */}
            {fromAi && <small className={classes.aiTag} data-unsure={unsure || undefined}>AI {fromAi.score ?? "?"}%</small>}
            {n === values.length - 1 && tail}
          </span>
        );
      }) : <span className={classes.pill}><IconTag size={13} /><span>{ctx.canLabel ? "Beri label" : "Belum diberi label"}</span>{tail}</span>}
    </button>
  );

  // The detail panel also spells out what the AI said and where its search found support.
  const notes = panel ? values.flatMap((value) => (item.aiLabels?.[value] ? [{ value, ...item.aiLabels[value] }] : [])) : [];

  // Clicks inside (the menu is portalled, but React events still bubble here) must not open the detail modal.
  const bar = (
    <div className={classes.bar} data-set={set || undefined} data-bleed={bleed || undefined} data-panel={panel || undefined}
      onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      {leading ?? <span className={classes.caption}>Label</span>}
      {ctx.canLabel ? (
        <Menu position="bottom-start" shadow="md" radius="md" width={220} withinPortal closeOnItemClick={false}>
          <Menu.Target>{pill}</Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>Pilih label (bisa lebih dari satu)</Menu.Label>
            {ctx.options.map((option) => (
              <Menu.Item key={option} disabled={busy} onClick={() => change(option, !values.includes(option))} role="menuitemcheckbox" aria-checked={values.includes(option)}
                leftSection={<i className={classes.dot} style={tint(option)} />}
                rightSection={values.includes(option) ? <IconCheck size={14} /> : null}>
                {option}
              </Menu.Item>
            ))}
            {set && <>
              <Menu.Divider />
              <Menu.Item color="red" disabled={busy} leftSection={<IconX size={14} />} onClick={() => change(null)}>Hapus semua label</Menu.Item>
            </>}
          </Menu.Dropdown>
        </Menu>
      ) : pill}
    </div>
  );
  if (!notes.length) return bar;
  return (
    <div className={classes.withNotes}>
      {bar}
      {notes.map((note) => (
        <div key={note.value} className={classes.note} style={tint(note.value)}>
          <b>{note.value} · dugaan AI {note.score ?? "?"}%</b>
          {note.reason && <p>{note.reason}</p>}
          {note.sources?.length ? (
            <ul>{note.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a> <small>{new URL(s.url).hostname}</small></li>)}</ul>
          ) : <p><small>{note.sources ? "Tidak ada sumber pendukung yang tercatat." : ""}</small></p>}
        </div>
      ))}
    </div>
  );
}
