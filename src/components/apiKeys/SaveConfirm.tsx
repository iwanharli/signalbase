"use client";
// Confirms saving a project's settings: what changes (before → after) and what happens to its AI categorisation.
import { Modal } from "@mantine/core";
import { IconDeviceFloppy, IconRefreshAlert } from "@tabler/icons-react";
import { formatNumber } from "@/lib/media/labels";
import { Button } from "../ui/Button";
import classes from "./apiKeys.module.css";

export type SettingChange = { label: string; before: string; after: string };
/** restart: stored AI labels are wiped and categorisation starts over; null when the project has no AI categorisation. */
export type SaveRequest = { changes: SettingChange[]; ai: { restart: boolean; labels: number } | null };

export function SaveConfirm({ request, onClose, onConfirm, loading }: {
  request: SaveRequest | null; onClose: () => void; onConfirm: () => void; loading?: boolean;
}) {
  const restart = !!request?.ai?.restart;
  return (
    <Modal aria-label="Konfirmasi simpan pengaturan" opened={!!request} onClose={onClose} centered size="lg" radius={20} padding={0} withCloseButton={false}
      overlayProps={{ backgroundOpacity: 0.55, blur: 6 }} transitionProps={{ transition: "pop", duration: 200 }}>
      {request && (
        <div className={classes.confirm}>
          <span className={classes.confirmIcon} data-tone={restart ? "warning" : "success"}>{restart ? <IconRefreshAlert size={22} /> : <IconDeviceFloppy size={22} />}</span>
          <b>{restart ? "Simpan dan ulangi kategorisasi AI?" : "Simpan perubahan pengaturan?"}</b>
          <p>Periksa perubahan berikut. Aplikasi yang memakai proyek ini langsung mengikuti pengaturan baru setelah disimpan.</p>

          <ul className={classes.changeList}>
            {request.changes.map((c) => (
              <li key={c.label}>
                <span>{c.label}</span>
                <div><s>{c.before}</s><i>→</i><b>{c.after}</b></div>
              </li>
            ))}
          </ul>

          {request.ai && (restart ? (
            <div className={classes.aiImpact} data-tone="warning">
              <b>Kategorisasi AI diulang dari awal</b>
              <span>Perubahan ini memasukkan data yang berbeda, jadi {formatNumber(request.ai.labels)} label yang ada dihapus dan semua item dilabeli ulang. Kredit AI terpakai lagi dan hasil lama tidak bisa dikembalikan.</span>
            </div>
          ) : (
            <div className={classes.aiImpact}>
              <b>Label kategorisasi AI tetap</b>
              <span>{formatNumber(request.ai.labels)} label yang sudah ada tidak berubah.</span>
            </div>
          ))}

          <div className={classes.confirmActions}>
            <Button variant="secondary" block onClick={onClose} disabled={loading}>Batal</Button>
            <Button variant="primary" block onClick={onConfirm} loading={loading}>{loading ? "Menyimpan…" : restart ? "Simpan & ulangi" : "Simpan"}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
