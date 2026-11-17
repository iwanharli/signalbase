"use client";
// Strip at the top of each card to give a post or article one of the project's manual labels (not AI categorisation).
// MediaBrowser provides the project's choices through ManualLabelContext; without a project, or without choices, nothing shows.
// Each choice keeps one colour (by its position in the project's list), so labelled cards are easy to spot in the grid.
import { createContext, useContext, useEffect, useState } from "react";
import { Loader, Menu } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconChevronDown, IconTag, IconX } from "@tabler/icons-react";
import { post } from "@/lib/api-client";
import { labelColor as colorOf } from "@/lib/media/manualLabels";
import type { MediaItem, MediaType } from "@/lib/media/types";
import classes from "./manualLabel.module.css";

/** onLabelled: lets the page re-render, so a label set in the detail modal shows on its card at once (and vice versa). */
export type ManualLabelContextValue = { keyId: string; type: MediaType; options: string[]; canLabel: boolean; onLabelled?: (code: string, label: string | null) => void };
export const ManualLabelContext = createContext<ManualLabelContextValue | null>(null);


/** bleed: inside a padded box (the Original View shell), pulled out to its edges like the strip on a Quick card.
 *  panel: a rounded box of its own (the detail modal's side panel). */
export function ManualLabelPicker({ item, bleed, panel }: { item: MediaItem; bleed?: boolean; panel?: boolean }) {
  const ctx = useContext(ManualLabelContext);
  const [value, setValue] = useState<string | null>(item.manualLabel ?? null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setValue(item.manualLabel ?? null), [item.manualLabel]);
  if (!ctx || !ctx.options.length) return null;

  const change = async (next: string | null) => {
    if (next === value) return;
    const before = value;
    setValue(next);
    setBusy(true);
    try {
      await post(`/api/admin/keys/${ctx.keyId}/item-labels`, { type: ctx.type, code: item.code, label: next }, "PUT");
      item.manualLabel = next; // the feed shares this object, so the label survives re-renders
      ctx.onLabelled?.(item.code, next);
    } catch (err) {
      setValue(before);
      notifications.show({ color: "red", message: `Label tidak tersimpan: ${(err as Error).message}` });
    } finally {
      setBusy(false);
    }
  };

  const color = value ? colorOf(ctx.options, value) : null;
  const pill = (
    <button type="button" className={classes.pill} data-set={value ? true : undefined} disabled={!ctx.canLabel || busy}
      aria-label={value ? `Label: ${value}${ctx.canLabel ? ", ubah" : ""}` : "Beri label"}>
      {busy ? <Loader size={11} color="currentColor" /> : value ? <i className={classes.dot} /> : <IconTag size={13} />}
      <span>{value ?? (ctx.canLabel ? "Beri label" : "Belum diberi label")}</span>
      {ctx.canLabel && <IconChevronDown size={13} className={classes.chevron} />}
    </button>
  );

  // Clicks inside (the menu is portalled, but React events still bubble here) must not open the detail modal.
  return (
    <div className={classes.bar} data-set={value ? true : undefined} data-bleed={bleed || undefined} data-panel={panel || undefined} style={color ? { ["--label" as string]: `var(--mantine-color-${color}-6)` } : undefined}
      onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <span className={classes.caption}>Label</span>
      {ctx.canLabel ? (
        <Menu position="bottom-start" shadow="md" radius="md" width={220} withinPortal>
          <Menu.Target>{pill}</Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>Pilih label</Menu.Label>
            {ctx.options.map((option) => (
              <Menu.Item key={option} onClick={() => change(option)}
                leftSection={<i className={classes.dot} style={{ ["--label" as string]: `var(--mantine-color-${colorOf(ctx.options, option)}-6)` }} />}
                rightSection={option === value ? <IconCheck size={14} /> : null}>
                {option}
              </Menu.Item>
            ))}
            {value && <>
              <Menu.Divider />
              <Menu.Item color="red" leftSection={<IconX size={14} />} onClick={() => change(null)}>Hapus label</Menu.Item>
            </>}
          </Menu.Dropdown>
        </Menu>
      ) : pill}
    </div>
  );
}
