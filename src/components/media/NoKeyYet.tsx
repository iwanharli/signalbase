"use client";
import { IconKey, IconMessages, IconWorldWww } from "@tabler/icons-react";
import { MEDIA_TYPE_LABEL } from "@/lib/media/labels";
import type { MediaType } from "@/lib/media/types";
import { Button } from "../ui/Button";
import classes from "./browser.module.css";

/** Shown to a user account that has no API key covering this media type yet: its feed starts empty. */
export function NoKeyYet({ type, hasKeys }: { type: MediaType; hasKeys: boolean }) {
  const Icon = type === "social" ? IconMessages : IconWorldWww;
  return (
    <div className={classes.emptyState} style={{ marginTop: 40 }}>
      <Icon size={36} stroke={1.5} aria-hidden />
      <b>{MEDIA_TYPE_LABEL[type]} masih kosong</b>
      <p>{hasKeys
        ? `Proyek Anda belum mencakup ${MEDIA_TYPE_LABEL[type].toLowerCase()}. Ubah cakupan proyek atau buat proyek baru untuk jenis media ini.`
        : "Data muncul setelah Anda membuat proyek dan menentukan keyword yang ingin dipantau. Hanya post dan berita yang menyebut keyword itu yang ditampilkan."}</p>
      <Button icon={IconKey} href={hasKeys ? "/api-keys" : "/api-keys/new"}>{hasKeys ? "Atur proyek" : "Buat proyek & atur keyword"}</Button>
    </div>
  );
}
