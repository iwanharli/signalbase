"use client";
// "Tampilan" button of the network toolbar: the display settings (style, colours, flow, how many accounts, emotions) in
// one popover, so the toolbar keeps to one row. A badge counts the settings away from their defaults. The popover stays
// inside the stage (no portal) so it also works in full screen.
import { useState } from "react";
import { Popover } from "@mantine/core";
import { IconAdjustmentsHorizontal, IconChevronDown } from "@tabler/icons-react";
import classes from "./sna.module.css";

export function ViewMenu({ changed, children }: { changed: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover opened={open} onChange={setOpen} position="bottom-end" offset={8} withinPortal={false} shadow="xl" radius={16} trapFocus={false}
      classNames={{ dropdown: classes.menu }} transitionProps={{ transition: "pop-top-right", duration: 160 }}>
      <Popover.Target>
        <button type="button" className={classes.menuButton} data-open={open || undefined} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <IconAdjustmentsHorizontal size={16} aria-hidden />Tampilan
          {changed > 0 && <span className={classes.menuBadge} aria-label={`${changed} pengaturan diubah`}>{changed}</span>}
          <IconChevronDown size={14} aria-hidden className={classes.menuChevron} />
        </button>
      </Popover.Target>
      <Popover.Dropdown>{children}</Popover.Dropdown>
    </Popover>
  );
}

export function MenuRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className={classes.menuRow}><span>{label}</span>{children}</div>;
}
