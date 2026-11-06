"use client";
// Styled replacement for window.confirm: icon, title, explanation, cancel + confirm.
import { Modal } from "@mantine/core";
import type { Icon } from "@tabler/icons-react";
import { Button } from "./Button";
import classes from "../apiKeys/apiKeys.module.css";

type Props = {
  opened: boolean; onClose: () => void; onConfirm: () => void; loading?: boolean;
  icon: Icon; title: string; description: React.ReactNode; confirmLabel: string; tone?: "danger" | "warning";
};

export function ConfirmDialog({ opened, onClose, onConfirm, loading, icon: IconEl, title, description, confirmLabel, tone = "danger" }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} centered size="md" radius={20} padding={0} withCloseButton={false}
      overlayProps={{ backgroundOpacity: 0.55, blur: 6 }} transitionProps={{ transition: "pop", duration: 200 }}>
      <div className={classes.confirm}>
        <span className={classes.confirmIcon} data-tone={tone === "warning" ? "warning" : undefined}><IconEl size={22} /></span>
        <b>{title}</b>
        <p>{description}</p>
        <div className={classes.confirmActions}>
          <Button variant="secondary" block onClick={onClose} disabled={loading}>Batal</Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} block onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </div>
      </div>
    </Modal>
  );
}
