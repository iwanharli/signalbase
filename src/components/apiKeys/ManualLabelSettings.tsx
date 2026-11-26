"use client";
// "Kustomisasi Label" tab of a project: the label choices people pick from on each post's card. Saved on its own (not part of
// the scope draft). Separate from AI categorisation. Each row shows the label's colour and how many posts carry it;
// renaming keeps those posts labelled, removing takes the label off them.
import { useEffect, useMemo, useState } from "react";
import { Modal, Skeleton } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconArrowBackUp, IconArrowRight, IconEye, IconRobot, IconChevronDown, IconChevronUp, IconDeviceFloppy, IconPlus, IconTag, IconTrash } from "@tabler/icons-react";
import { post } from "@/lib/api-client";
import type { MediaType } from "@/lib/media/types";
import { ANY_LABEL, labelColor, MAX_LABEL_LENGTH, MAX_LABELS, normalizeLabels, type LabelRename, type LabelSettings } from "@/lib/media/manualLabels";
import { useApi } from "@/lib/useApi";
import { Button } from "../ui/Button";
import { LabelAiProgress } from "./LabelAiProgress";
import { BalanceUsage } from "../ai/BalanceUsage";
import c from "./manualLabelSettings.module.css";

type Row = { id: number; original: string | null; name: string; removed: boolean };
const SUGGESTIONS = ["Hoaks", "Tidak hoaks", "Perlu verifikasi", "Tindak lanjut", "Prioritas", "Abaikan"];
let nextId = 1;
const rowsFrom = (options: string[]): Row[] => options.map((o) => ({ id: nextId++, original: o, name: o, removed: false }));
const colorVar = (options: string[], label: string) => `var(--mantine-color-${labelColor(options, label)}-6)`;

const REFRESH_MS = 30_000;

export function ManualLabelSettings({ keyId, resultType }: { keyId: string; resultType: MediaType }) {
  const settings = useApi<LabelSettings>(`/api/admin/keys/${keyId}/labels`);
  const [rows, setRows] = useState<Row[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  /** A used label waiting for the delete warning to be confirmed. */
  const [confirming, setConfirming] = useState<Row | null>(null);
  // Rows follow the saved choices only when those change, so a refresh of the counts leaves edits and focus alone.
  const savedKey = settings.data ? JSON.stringify(settings.data.options) : null;
  useEffect(() => { if (savedKey) setRows(rowsFrom(JSON.parse(savedKey) as string[])); }, [savedKey]);
  const refresh = settings.reload;
  useEffect(() => {
    const timer = setInterval(() => { if (!document.hidden) refresh(); }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const tidy = (name: string) => name.trim().replace(/\s+/g, " ");
  const kept = rows.filter((r) => !r.removed);
  const names = kept.map((r) => tidy(r.name));
  const saved = settings.data?.options ?? [];
  const counts = settings.data?.counts ?? {};
  const problem = useMemo(() => {
    if (names.some((n) => !n)) return "Nama label tidak boleh kosong";
    if (names.some((n) => n.length > MAX_LABEL_LENGTH)) return `Nama label maksimal ${MAX_LABEL_LENGTH} karakter`;
    const lower = names.map((n) => n.toLocaleLowerCase("id"));
    if (new Set(lower).size !== lower.length) return "Ada nama label yang sama";
    return null;
  }, [names]);
  const renames: LabelRename[] = kept.filter((r) => r.original && r.name.trim() !== r.original).map((r) => ({ from: r.original!, to: r.name.trim().replace(/\s+/g, " ") }));
  const removedRows = rows.filter((r) => r.removed && r.original);
  const lost = removedRows.reduce((n, r) => n + (counts[r.original!] ?? 0), 0);
  const dirty = JSON.stringify(names) !== JSON.stringify(saved);

  if (!settings.data) return settings.error ? <p className={c.note}>{settings.error}</p> : <Skeleton h={160} radius="md" />;
  const canEdit = settings.data.canEdit;
  const total = settings.data.labelledItems;

  const add = (name: string) => {
    const label = name.trim().replace(/\s+/g, " ");
    if (!label) return;
    if (names.some((n) => n.toLocaleLowerCase("id") === label.toLocaleLowerCase("id"))) {
      notifications.show({ color: "orange", message: `Label "${label}" sudah ada` });
      return;
    }
    if (kept.length >= MAX_LABELS) {
      notifications.show({ color: "orange", message: `Maksimal ${MAX_LABELS} label per proyek` });
      return;
    }
    setRows((rs) => [...rs, { id: nextId++, original: null, name: label.slice(0, MAX_LABEL_LENGTH), removed: false }]);
    setDraft("");
  };
  const patch = (id: number, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const move = (id: number, by: -1 | 1) => setRows((rs) => {
    const list = [...rs];
    const i = list.findIndex((r) => r.id === id);
    let j = i + by;
    while (list[j]?.removed) j += by; // skip rows marked for removal
    if (j < 0 || j >= list.length) return rs;
    [list[i], list[j]] = [list[j], list[i]];
    return list;
  });
  // A label already on posts asks first (deleting it takes it off them, at once); an unused or new one just goes.
  const remove = (row: Row) => {
    if (row.original && (counts[row.original] ?? 0) > 0) setConfirming(row);
    else if (row.original) patch(row.id, { removed: true });
    else setRows((rs) => rs.filter((r) => r.id !== row.id));
  };

  /** Saves the given rows (the current draft by default). */
  const save = async (list: Row[] = rows) => {
    const keep = list.filter((r) => !r.removed);
    const options = keep.map((r) => tidy(r.name));
    const moves = keep.filter((r) => r.original && tidy(r.name) !== r.original).map((r) => ({ from: r.original!, to: tidy(r.name) }));
    setBusy(true);
    try {
      const res = (await post(`/api/admin/keys/${keyId}/labels`, { options: normalizeLabels(options), renames: moves }, "PUT")) as { removed: number; renamed: number };
      const notes = [res.renamed && `${res.renamed} label diganti nama`, res.removed && `${res.removed} label dilepas dari post`].filter(Boolean);
      notifications.show({ color: "teal", message: `Label disimpan${notes.length ? `. ${notes.join(", ")}.` : ""}` });
      setConfirming(null);
      // Also when the names end up as they were (one removed and added again), where the effect above would not run.
      setRows(rowsFrom(normalizeLabels(options)));
      settings.reload();
    } catch (err) {
      notifications.show({ color: "red", message: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const preview = names.find(Boolean);
  return (
    <div className={c.root}>
      {canEdit && (
        <div className={c.aiLink}>
          <IconRobot size={18} />
          <span><b>Pelabelan AI</b><small>AI memilih label untuk tiap post secara otomatis</small></span>
          {/* Every labelled item: the page's default "analysed" and "relevant" filters would hide some, so both are cleared. */}
          <Button size="sm" variant="secondary" icon={IconEye} href={`/media/${resultType}?key=${keyId}&label=${ANY_LABEL}&analyzed=&relevance=`}>Lihat hasil</Button>
          <Button size="sm" variant="primary" iconRight={IconArrowRight} href={`/project/${keyId}/labels`}>Pengaturan</Button>
        </div>
      )}

      <div className={c.stats}>
        <div><b>{saved.length}</b><span>pilihan label</span></div>
        <div><b>{total.toLocaleString("id-ID")}</b><span>post diberi label</span></div>
        {preview && (
          <div className={c.preview} aria-hidden>
            <span>Tampilan di kartu</span>
            <i className={c.previewBar} style={{ ["--label" as string]: colorVar(names, preview) }}><small>LABEL</small><em><s />{preview}</em></i>
          </div>
        )}
      </div>

      {canEdit && (
        <form className={c.adder} onSubmit={(e) => { e.preventDefault(); add(draft); }}>
          <IconTag size={16} className={c.adderIcon} />
          <input value={draft} onChange={(e) => setDraft(e.currentTarget.value)} maxLength={MAX_LABEL_LENGTH} placeholder="Nama label baru, mis. Hoaks" aria-label="Nama label baru" />
          <Button type="submit" size="sm" variant="primary" icon={IconPlus} disabled={!draft.trim()}>Tambah</Button>
        </form>
      )}

      {!rows.length ? (
        <div className={c.empty}>
          <IconTag size={22} />
          <b>Belum ada pilihan label</b>
          <p>{canEdit ? "Tambahkan label di atas, atau mulai dari contoh berikut:" : "Admin dapat menambahkannya."}</p>
          {canEdit && <div className={c.suggest}>{SUGGESTIONS.map((s) => <button key={s} type="button" onClick={() => add(s)}><IconPlus size={12} />{s}</button>)}</div>}
        </div>
      ) : (
        <ol className={c.list}>
          {rows.map((row) => {
            const name = row.name.trim() || row.original || "";
            const count = row.original ? counts[row.original] ?? 0 : 0;
            const keptIndex = kept.indexOf(row);
            return (
              <li key={row.id} className={c.row} data-removed={row.removed || undefined} data-new={!row.original || undefined}
                style={{ ["--label" as string]: row.removed ? "var(--mantine-color-gray-5)" : colorVar(names, name.replace(/\s+/g, " ")) }}>
                <span className={c.dot} />
                {canEdit && !row.removed
                  ? <input className={c.name} value={row.name} maxLength={MAX_LABEL_LENGTH} onChange={(e) => patch(row.id, { name: e.currentTarget.value })} aria-label={`Nama label ${row.original ?? "baru"}`} />
                  : <span className={c.nameText}>{row.original ?? row.name}</span>}
                <span className={c.meta}>
                  {!row.original ? <em className={c.badge}>baru</em>
                    : row.removed ? <em className={c.badge} data-tone="danger">{count ? `dihapus · ${count} post dilepas` : "dihapus"}</em>
                    : row.name.trim() !== row.original ? <em className={c.badge}>ganti nama · {count} post ikut</em>
                    : <span>{count.toLocaleString("id-ID")} post</span>}
                </span>
                {canEdit && (
                  <span className={c.actions}>
                    {row.removed ? (
                      <button type="button" onClick={() => patch(row.id, { removed: false })} title="Urungkan"><IconArrowBackUp size={15} /></button>
                    ) : <>
                      <button type="button" onClick={() => move(row.id, -1)} disabled={keptIndex <= 0} title="Naikkan"><IconChevronUp size={15} /></button>
                      <button type="button" onClick={() => move(row.id, 1)} disabled={keptIndex === kept.length - 1} title="Turunkan"><IconChevronDown size={15} /></button>
                      <button type="button" onClick={() => remove(row)} title="Hapus" data-danger><IconTrash size={15} /></button>
                    </>}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <p className={c.note}>
        Label tampil di bagian atas setiap kartu Media Sosial dan Media Online saat dilihat lewat proyek ini, dengan warna sesuai urutan di sini.
        Hanya admin yang memberi label; klien dan viewer melihat labelnya. Terpisah dari kategorisasi AI.
      </p>

      {canEdit && (dirty || removedRows.length > 0) && (
        <div className={c.savebar}>
          <span>
            {problem ?? ([
              renames.length && `${renames.length} ganti nama`,
              removedRows.length && `${removedRows.length} dihapus${lost ? ` (${lost} label dilepas dari post)` : ""}`,
              rows.filter((r) => !r.original).length && `${rows.filter((r) => !r.original).length} baru`,
            ].filter(Boolean).join(" · ") || "Urutan diubah")}
          </span>
          <Button size="sm" variant="subtle" onClick={() => setRows(rowsFrom(saved))} disabled={busy}>Batalkan</Button>
          <Button size="sm" variant="primary" icon={IconDeviceFloppy} onClick={() => save()} loading={busy} disabled={!!problem}>Simpan label</Button>
        </div>
      )}

      {canEdit && <div className={c.usage}><BalanceUsage keyId={keyId} labelling /></div>}

      {canEdit && <LabelAiProgress keyId={keyId} />}

      <Modal opened={!!confirming} onClose={() => !busy && setConfirming(null)} centered radius="lg" size="sm"
        title={<span className={c.warnTitle}><IconAlertTriangle size={18} />Hapus label yang sedang dipakai?</span>}>
        {confirming && (() => {
          const used = counts[confirming.original!] ?? 0;
          const others = dirty && rows.some((r) => r.id !== confirming.id && (r.removed || !r.original || tidy(r.name) !== r.original));
          return (
            <div className={c.confirm}>
              <span className={c.confirmLabel} style={{ ["--label" as string]: colorVar(saved, confirming.original!) }}><i />{confirming.original}</span>
              <p><b>{used.toLocaleString("id-ID")} post</b> yang diberi label ini akan <b>kehilangan label ini</b> (label lainnya tetap). Tindakan ini tidak dapat dibatalkan.</p>
              <p className={c.note}>Untuk sekadar mengganti nama, batalkan lalu ubah namanya langsung di daftar: post tetap berlabel.{others ? " Perubahan lain yang belum disimpan ikut disimpan." : ""}</p>
              <div className={c.confirmActions}>
                <Button variant="subtle" onClick={() => setConfirming(null)} disabled={busy}>Batal</Button>
                <Button variant="danger" icon={IconTrash} loading={busy}
                  onClick={() => save(rows.map((r) => (r.id === confirming.id ? { ...r, removed: true } : r)))}>Hapus label</Button>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
