"use client";
// Dropdown on each card to give a post or article one of the project's manual labels (not AI categorisation).
// MediaBrowser provides the project's choices through ManualLabelContext; without a project, or without choices, nothing shows.
import { createContext, useContext, useEffect, useState } from "react";
import { Select } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconTag } from "@tabler/icons-react";
import { post } from "@/lib/api-client";
import type { MediaItem, MediaType } from "@/lib/media/types";
import classes from "./manualLabel.module.css";

export type ManualLabelContextValue = { keyId: string; type: MediaType; options: string[]; canLabel: boolean };
export const ManualLabelContext = createContext<ManualLabelContextValue | null>(null);

export function ManualLabelPicker({ item }: { item: MediaItem }) {
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
    } catch (err) {
      setValue(before);
      notifications.show({ color: "red", message: `Label tidak tersimpan: ${(err as Error).message}` });
    } finally {
      setBusy(false);
    }
  };

  // Clicks inside (the dropdown is portalled, but React events still bubble here) must not open the detail modal.
  return (
    <div className={classes.wrap} data-set={value ? true : undefined} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <Select
        size="xs"
        aria-label="Label manual"
        placeholder={ctx.canLabel ? "Beri label…" : "Belum diberi label"}
        data={ctx.options}
        value={value}
        onChange={change}
        clearable={ctx.canLabel}
        disabled={!ctx.canLabel || busy}
        allowDeselect={false}
        comboboxProps={{ withinPortal: true, shadow: "md" }}
        leftSection={<IconTag size={13} />}
        classNames={{ input: classes.input }}
      />
    </div>
  );
}
