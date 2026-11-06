"use client";
// Copies a key's full value. The value is fetched only when clicked and never kept in page state.
import { useState } from "react";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import { api } from "@/lib/api-client";
import { Button } from "../ui/Button";

const COPIED_MS = 1600;

export function CopyKeyButton({ keyId, copyable, size = "sm", onDark, iconOnly, label = "Salin" }: {
  keyId: string;
  /** False for keys created before encrypted storage; those must be rotated once. */
  copyable: boolean;
  size?: "sm" | "md";
  onDark?: boolean;
  iconOnly?: boolean;
  label?: string;
}) {
  const [state, setState] = useState<"idle" | "loading" | "copied">("idle");

  const copy = async () => {
    setState("loading");
    try {
      const { key } = await api<{ key: string }>(`/api/admin/keys/${keyId}/secret`, { cache: "no-store" });
      await navigator.clipboard.writeText(key);
      setState("copied");
      setTimeout(() => setState("idle"), COPIED_MS);
    } catch (err) {
      setState("idle");
      notifications.show({ color: "red", message: (err as Error).message || "Gagal menyalin kunci" });
    }
  };

  return (
    <Button size={size} onDark={onDark} iconOnly={iconOnly} variant="secondary" icon={state === "copied" ? IconCheck : IconCopy} onClick={copy} loading={state === "loading"}
      disabled={!copyable} title={copyable ? "Salin kunci lengkap" : "Kunci lama tidak tersimpan. Buat ulang kunci di tab Keamanan agar bisa disalin."}>
      {state === "copied" ? "Tersalin" : iconOnly ? "Salin kunci" : label}
    </Button>
  );
}
