"use client";
// SNA watches ("pantauan"): pick one to see the network around an ad hoc matter, or set one up by hand with a name and
// keywords (e.g. "Listyo makar": listyo, makar, sadap). Within a project it reads that project's posts that also mention
// one of the keywords; without a project (admins) the whole bank.
import { useState } from "react";
import { Modal, Select, TagsInput, TextInput, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconEye, IconPlus, IconTrash, IconX } from "@tabler/icons-react";
import { api, post } from "@/lib/api-client";
import { keywordProblem } from "@/lib/media/keywordExpr";
import controlClasses from "../ui/controls.module.css";
import { Button } from "../ui/Button";
import classes from "./sna.module.css";

export type SnaWatch = { id: string; name: string; keywords: string[]; createdAt: string };
type Props = { /** Full screen: open dropdown and dialog inside this element (the stage). */ portalTarget?: HTMLElement | null; keyId: string | null; watches: SnaWatch[]; canManage: boolean; value: string | null; onChange: (id: string | null) => void; onChanged: () => void };

const selectClasses = { input: controlClasses.selectInput, section: controlClasses.selectSection, dropdown: controlClasses.selectDropdown, option: controlClasses.selectOption };

export function SnaWatchPicker({ portalTarget = null, keyId, watches, canManage, value, onChange, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  if (!watches.length && !canManage) return null;
  return (
    <div className={classes.watchPick}>
      <Select aria-label="Pantauan" w={200} clearable searchable placeholder={watches.length ? "Pantauan" : "Belum ada pantauan"} disabled={!watches.length && !value}
        leftSection={<IconEye size={15} />} classNames={selectClasses} comboboxProps={{ withinPortal: true, zIndex: 400, ...(portalTarget ? { portalProps: { target: portalTarget } } : {}) }}
        value={value} onChange={onChange} data={watches.map((w) => ({ value: w.id, label: w.name }))}
        renderOption={({ option }) => {
          const w = watches.find((x) => x.id === option.value);
          return <div className={classes.watchOption}><b>{option.label}</b><small>{w?.keywords.join(", ")}</small></div>;
        }} />
      {canManage && (
        <Tooltip label="Atur pantauan" withinPortal={false} position="bottom" withArrow>
          <button type="button" className={classes.watchAdd} aria-label="Atur pantauan" onClick={() => setOpen(true)}><IconPlus size={16} /></button>
        </Tooltip>
      )}
      <WatchDialog portalTarget={portalTarget} opened={open} onClose={() => setOpen(false)} keyId={keyId} watches={watches} onChanged={onChanged}
        onCreated={(id) => { setOpen(false); onChange(id); }} onDeleted={(id) => { if (id === value) onChange(null); }} />
    </div>
  );
}

function WatchDialog({ portalTarget, opened, onClose, keyId, watches, onChanged, onCreated, onDeleted }: {
  portalTarget: HTMLElement | null; opened: boolean; onClose: () => void; keyId: string | null; watches: SnaWatch[]; onChanged: () => void; onCreated: (id: string) => void; onDeleted: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const problem = keywords.map((k) => { const p = keyword(k); return p && `"${k}": ${p}`; }).find(Boolean) ?? null;
  const ready = name.trim().length >= 2 && keywords.length > 0 && !problem;

  const save = async () => {
    setSaving(true);
    try {
      const { watch } = (await post("/api/admin/sna/watches", { projectId: keyId, name, keywords })) as { watch: SnaWatch };
      notifications.show({ color: "teal", message: `Pantauan "${watch.name}" dibuat. Jaringannya sedang dimuat.` });
      setName("");
      setKeywords([]);
      onChanged();
      onCreated(watch.id);
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    } finally { setSaving(false); }
  };
  const remove = async (w: SnaWatch) => {
    setDeleting(w.id);
    try {
      await api(`/api/admin/sna/watches/${encodeURIComponent(w.id)}`, { method: "DELETE" });
      onDeleted(w.id);
      onChanged();
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    } finally { setDeleting(null); }
  };

  return (
    <Modal opened={opened} onClose={onClose} {...(portalTarget ? { portalProps: { target: portalTarget } } : {})} centered size="lg" radius={20} title={<span className={classes.watchTitle}><IconEye size={18} />Pantauan SNA</span>}
      overlayProps={{ backgroundOpacity: 0.55, blur: 6 }} transitionProps={{ transition: "pop", duration: 200 }}>
      <div className={classes.watchForm}>
        <p className={classes.watchNote}>
          Pantau jaringan akun untuk isu mendadak. Post yang menyebut <b>salah satu</b> kata kunci ikut dihitung{keyId ? ", hanya dari post proyek ini" : ", dari seluruh bank data"}.
          Pakai <code>AND</code> bila kata harus muncul bersama, misalnya <code>listyo AND makar</code>.
        </p>
        <TextInput label="Nama pantauan" placeholder="mis. Isu Listyo makar" value={name} maxLength={60} onChange={(e) => setName(e.currentTarget.value)} />
        <TagsInput label="Kata kunci" description="Tekan Enter atau koma setelah tiap kata kunci (maks. 10)." placeholder="mis. listyo, makar, sadap"
          value={keywords} onChange={(v) => setKeywords(v.map((k) => k.trim().toLowerCase()).filter(Boolean))} splitChars={[","]} maxTags={10} clearable error={problem} />
        <div className={classes.watchActions}>
          <Button variant="primary" onClick={save} loading={saving} disabled={!ready}>Buat dan tampilkan</Button>
        </div>
      </div>
      {watches.length > 0 && (
        <div className={classes.watchList}>
          <span className={classes.watchListHead}>Pantauan tersimpan</span>
          {watches.map((w) => (
            <div key={w.id} className={classes.watchRow}>
              <div><b>{w.name}</b><span>{w.keywords.map((k) => <i key={k}>{k}</i>)}</span></div>
              <Tooltip label="Hapus pantauan" withArrow>
                <button type="button" aria-label={`Hapus pantauan ${w.name}`} disabled={deleting === w.id} onClick={() => void remove(w)}>
                  {deleting === w.id ? <IconX size={15} /> : <IconTrash size={15} />}
                </button>
              </Tooltip>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

/** Why a keyword cannot be used, or null. */
const keyword = (k: string) => (k.length < 2 ? "minimal 2 karakter" : keywordProblem(k));
