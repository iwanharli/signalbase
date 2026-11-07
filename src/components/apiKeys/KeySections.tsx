"use client";
// Side sub-menu + content panel used by the create-key wizard and the key detail page.
import type { Icon } from "@tabler/icons-react";
import { IconCheck } from "@tabler/icons-react";
import classes from "./keySections.module.css";

export type SectionItem<T extends string> = {
  id: T;
  label: string;
  icon: Icon;
  /** One-line summary of the section's current value, shown under the label. */
  summary?: string;
  /** Wizard: completed steps get a check mark. */
  done?: boolean;
  /** Small marker, e.g. unsaved changes. */
  badge?: string;
  tone?: "danger";
};

export function SectionNav<T extends string>({ items, active, onSelect, numbered }: {
  items: SectionItem<T>[];
  active: T;
  onSelect: (id: T) => void;
  /** Show step numbers (create wizard). */
  numbered?: boolean;
}) {
  return (
    <nav className={classes.nav} aria-label="Bagian">
      {items.map((item, index) => (
        <button key={item.id} type="button" className={classes.navItem} data-active={item.id === active || undefined} data-tone={item.tone}
          aria-current={item.id === active ? (numbered ? "step" : "true") : undefined} onClick={() => onSelect(item.id)}>
          <span className={classes.navIcon} data-done={item.done || undefined}>
            {item.done && item.id !== active ? <IconCheck size={15} /> : numbered ? index + 1 : <item.icon size={16} />}
          </span>
          <span className={classes.navText}>
            <b>{item.label}{item.badge && <em>{item.badge}</em>}</b>
            {item.summary && <small>{item.summary}</small>}
          </span>
        </button>
      ))}
    </nav>
  );
}

export function SectionPanel({ icon: IconComponent, title, description, children, footer }: {
  icon: Icon;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <section className={classes.panel}>
      <header className={classes.panelHead}>
        <span className={classes.panelIcon}><IconComponent size={18} /></span>
        <div><h2>{title}</h2>{description && <p>{description}</p>}</div>
      </header>
      <div className={classes.panelBody}>{children}</div>
      {footer && <footer className={classes.panelFoot}>{footer}</footer>}
    </section>
  );
}

/** Two-column layout: sub-menu on the left, the active section on the right. */
export function SectionLayout({ nav, children }: { nav: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={classes.layout}>
      <aside className={classes.side}>{nav}</aside>
      <div className={classes.main}>{children}</div>
    </div>
  );
}
