import type { Icon } from "@tabler/icons-react";
import classes from "./inDevelopment.module.css";

/** Placeholder for an Analisis page that is not built yet. */
export function InDevelopment({ title, icon: Icon, text }: { title: string; icon: Icon; text: string }) {
  return (
    <section className={classes.box}>
      <span className={classes.icon}><Icon size={34} stroke={1.6} /></span>
      <span className={classes.badge}>Sedang dalam pengembangan</span>
      <h1>{title}</h1>
      <p>{text}</p>
    </section>
  );
}
