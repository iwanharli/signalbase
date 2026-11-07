"use client";
import { splitPostText } from "@/lib/media/text";
import classes from "./postText.module.css";

export function PostText({ text }: { text: string }) {
  return <>{splitPostText(text).map((part, index) => {
    if (part.href) return <a key={index} href={part.href} className={classes.link} target="_blank" rel="noopener noreferrer nofollow"
      aria-label={`${part.text} (buka di tab baru)`} title="Buka tautan di tab baru" onClick={(event) => event.stopPropagation()}>{part.text}</a>;
    return part.mention ? <span key={index} className={classes.mention}>{part.text}</span> : part.text;
  })}</>;
}
