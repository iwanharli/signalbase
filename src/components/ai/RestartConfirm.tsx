"use client";
// Confirms a change that wipes a key's AI results and relabels everything from scratch.
import { Modal } from "@mantine/core";
import { IconRefreshAlert } from "@tabler/icons-react";
import { formatNumber } from "@/lib/media/labels";
import { Button } from "../ui/Button";
import classes from "../apiKeys/apiKeys.module.css";

export type RestartRequest = { changes: string[]; results: number; run: () => Promise<void> | void };

export function RestartConfirm({ request, onClose, loading }: { request: RestartRequest | null; onClose: () => void; loading?: boolean }) {
  return (
    <Modal aria-label="Konfirmasi ulangi kategorisasi AI" opened={!!request} onClose={onClose} centered size="md" radius={20} padding={0} withCloseButton={false}
      overlayProps={{ backgroundOpacity: 0.55, blur: 6 }} transitionProps={{ transition: "pop", duration: 200 }}>
      {request && (
        <div className={classes.confirm}>
          <span className={classes.confirmIcon} data-tone="warning"><IconRefreshAlert size={22} /></span>
          <b>Ulangi kategorisasi AI dari awal?</b>
          <p>Perubahan pada <strong>{request.changes.join(", ")}</strong> membuat hasil lama tidak lagi sesuai.</p>
          <ul className={classes.restartList}>
            <li><span>Hasil yang dihapus</span><b>{formatNumber(request.results)} item</b></li>
            <li><span>Setelah disimpan</span><b>Diproses ulang dari awal</b></li>
            <li><span>Biaya</span><b>Kredit AI terpakai lagi</b></li>
          </ul>
          <p>Hasil lama tidak bisa dikembalikan. Data di bank sumber tidak berubah.</p>
          <div className={classes.confirmActions}>
            <Button variant="secondary" block onClick={onClose} disabled={loading}>Batal</Button>
            <Button variant="primary" block onClick={() => request.run()} loading={loading}>{loading ? "Menyimpan…" : "Simpan & ulangi"}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
