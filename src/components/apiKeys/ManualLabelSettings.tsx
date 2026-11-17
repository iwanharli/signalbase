"use client";
// "Label manual" tab of a project: the label choices people pick from on each post's card. Saved on its own (not part of
// the scope draft). Separate from AI categorisation.
import { useEffect, useState } from "react";
import { Skeleton, TagsInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconDeviceFloppy } from "@tabler/icons-react";
import { post } from "@/lib/api-client";
import { MAX_LABEL_LENGTH, MAX_LABELS, normalizeLabels, type LabelSettings } from "@/lib/media/manualLabels";
import { useApi } from "@/lib/useApi";
import { Button } from "../ui/Button";
import classes from "./manualLabelSettings.module.css";

export function ManualLabelSettings({ keyId }: { keyId: string }) {
  const settings = useApi<LabelSettings>(`/api/admin/keys/${keyId}/labels`);
  const [draft, setDraft] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (settings.data) setDraft(settings.data.options); }, [settings.data]);

  if (!settings.data) return settings.error ? <p className={classes.note}>{settings.error}</p> : <Skeleton h={90} radius="md" />;
  const saved = settings.data.options;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const dropped = saved.filter((l) => !draft.includes(l));

  const save = async () => {
    setBusy(true);
    try {
      const res = (await post(`/api/admin/keys/${keyId}/labels`, { options: normalizeLabels(draft) }, "PUT")) as { removed: number };
      notifications.show({ color: "teal", message: res.removed ? `Label disimpan. ${res.removed} post dilepas dari label yang dihapus.` : "Label disimpan" });
      settings.reload();
    } catch (err) {
      notifications.show({ color: "red", message: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  if (!settings.data.canEdit) {
    return saved.length
      ? <div className={classes.chips}>{saved.map((l) => <span key={l}>{l}</span>)}</div>
      : <p className={classes.note}>Belum ada pilihan label. Pemilik proyek atau admin dapat menambahkannya.</p>;
  }

  return (
    <div className={classes.root}>
      <TagsInput
        label="Pilihan label"
        description={`Ketik label lalu tekan Enter. Maksimal ${MAX_LABELS} label, masing-masing ${MAX_LABEL_LENGTH} karakter. Urutan di sini menjadi urutan di dropdown.`}
        placeholder={draft.length ? "Tambah label…" : "Mis. Prioritas, Tindak lanjut, Hoaks, Abaikan"}
        value={draft}
        onChange={setDraft}
        maxTags={MAX_LABELS}
        splitChars={[","]}
        clearable
      />
      {dropped.length > 0 && (
        <p className={classes.warn}>Label yang dihapus ({dropped.join(", ")}) akan dilepas dari semua post yang memakainya.</p>
      )}
      <p className={classes.note}>
        Label muncul sebagai dropdown di setiap kartu Media Sosial dan Media Online saat dilihat lewat proyek ini. Pemilik proyek, admin, dan
        anggota klien yang diberi akses dapat memberi label; viewer hanya melihat. Label ini terpisah dari kategorisasi AI.
      </p>
      <div><Button variant="primary" icon={IconDeviceFloppy} onClick={save} loading={busy} disabled={!dirty}>Simpan label</Button></div>
    </div>
  );
}
