"use client";
// One button for the whole panel, so actions look the same everywhere.
// Renders a Next.js <Link> when `href` is given, otherwise a <button>.
import Link from "next/link";
import { Tooltip } from "@mantine/core";
import type { Icon } from "@tabler/icons-react";
import classes from "./ui.module.css";

type Variant = "primary" | "secondary" | "danger" | "dangerOutline" | "subtle";

type Common = {
  variant?: Variant;
  size?: "sm" | "md";
  /** Set on dark panels so secondary/subtle variants stay readable. */
  onDark?: boolean;
  icon?: Icon;
  iconRight?: Icon;
  /** Stretch to the container width. */
  block?: boolean;
  /** Show only the icon; `children` becomes the tooltip and accessible label. */
  iconOnly?: boolean;
  children: React.ReactNode;
  className?: string;
};

type AsButton = Common & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & { href?: undefined; loading?: boolean };
type AsLink = Common & { href: string; title?: string };

export function Button(props: AsButton | AsLink) {
  let element: React.ReactElement;
  if ("href" in props && props.href) {
    const { href, title, ...look } = props; // eslint-disable-line @typescript-eslint/no-unused-vars -- title becomes a Tip below
    element = <Link href={href} aria-label={look.iconOnly ? String(look.children) : undefined} {...visual(look)}>{content(look)}</Link>;
  } else {
    const { variant, size, onDark, icon, iconRight, block, iconOnly, children, className, loading, title, ...rest } = props as AsButton; // eslint-disable-line @typescript-eslint/no-unused-vars -- title becomes a Tip below
    const look = { variant, size, onDark, icon, iconRight, block, iconOnly, children, className };
    element = (
      <button type="button" {...rest} {...visual(look)} aria-label={iconOnly ? String(children) : rest["aria-label"]}
        disabled={rest.disabled || loading} data-loading={loading || undefined}>
        {content(look)}
      </button>
    );
  }
  // Icon-only buttons explain themselves on hover; a title (e.g. why it is disabled) wins over the label.
  const title = "title" in props ? props.title : undefined;
  if (!props.iconOnly && !title) return element;
  const tip = title || props.children;
  return <Tooltip label={tip} withArrow openDelay={250} position="top"><span className={classes.tipTarget}>{element}</span></Tooltip>;
}

/** Buttons that share borders, like a toolbar. */
export function ButtonGroup({ children }: { children: React.ReactNode }) {
  return <div className={classes.group} role="group">{children}</div>;
}

function visual({ variant = "secondary", size = "md", onDark, block, iconOnly, className }: Common) {
  return {
    className: [classes.button, className].filter(Boolean).join(" "),
    "data-variant": variant,
    "data-size": size,
    "data-on-dark": onDark || undefined,
    "data-block": block || undefined,
    "data-icon-only": iconOnly || undefined,
  };
}

function content({ size = "md", icon: IconLeft, iconRight: IconRight, children }: Common) {
  const iconSize = size === "sm" ? 14 : 16;
  return (
    <>
      {IconLeft && <IconLeft size={iconSize} />}
      <span>{children}</span>
      {IconRight && <IconRight size={iconSize} />}
    </>
  );
}

/** Small rounded status label (Aktif, Dicabut, …). */
export function StatusPill({ tone = "neutral", children }: { tone?: "success" | "info" | "warning" | "danger" | "neutral"; children: React.ReactNode }) {
  return <span className={classes.pill} data-tone={tone}>{children}</span>;
}
