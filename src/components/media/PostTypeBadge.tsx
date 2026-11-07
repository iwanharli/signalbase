import { humanize, POST_TYPE_LABEL } from "@/lib/media/labels";
import classes from "./postTypeBadge.module.css";

export function PostTypeBadge({ value, onDark }: { value: string; onDark?: boolean }) {
  return <span className={classes.badge} data-type={value} data-on-dark={onDark || undefined}>{POST_TYPE_LABEL[value] ?? humanize(value)}</span>;
}
