import c from "./landing.module.css";

/** Wraps a public page so it fades and rises in on arrival; the page header's lines follow one after another. */
export function PageEnter({ children }: { children: React.ReactNode }) {
  return <div className={c.pageEnter}>{children}</div>;
}
