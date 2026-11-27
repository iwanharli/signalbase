"use client";
// Kata kunci tab of a project: the keywords in a paged table with how many social posts and news each brought in over the
// last 7 / 30 / 90 days, an input to add one (checked as you type) and a remove button per row. Changes are kept in the
// page's draft scope and saved with the page's Save button, like every other tab. Keywords can be put in groups (themes);
// the table then lists them group by group, each with its total (posts matching any of its keywords, counted once).
import { useEffect, useMemo, useState } from "react";
import { Autocomplete, Pagination, TextInput } from "@mantine/core";
import { IconArticle, IconBrandX, IconFolder, IconPlus, IconSearch, IconTrash } from "@tabler/icons-react";
import type { KeyScope } from "@/lib/media/keyScope";
import { isKeywordExpression, keywordProblem } from "@/lib/media/keywordExpr";
import { groupKeywords, groupNames, UNGROUPED, type KeywordGroups } from "@/lib/media/keywordGroups";
import { formatNumber } from "@/lib/media/labels";
import { useApi } from "@/lib/useApi";
import { Segmented } from "../ui/controls";
import { Button } from "../ui/Button";
import c from "./keywordTable.module.css";

const PAGE_SIZE = 10;
const RANGE_OPTIONS = [{ value: "7", label: "7 hari" }, { value: "30", label: "30 hari" }, { value: "90", label: "90 hari" }] as const;
type Range = (typeof RANGE_OPTIONS)[number]["value"];
type CountsResponse = {
  days: number; from: string; keywords: { keyword: string; social: number | null; online: number | null }[];
  groups?: { name: string; social: number | null; online: number | null }[]; total: { social: number | null; online: number | null };
  /** A long keyword list being counted in the background: ask again shortly. */
  pending?: boolean;
};

/** Plain word, phrase, or AND / OR expression. */
const kindOf = (k: string) => (isKeywordExpression(k) ? "Ekspresi" : /\s/.test(k.trim()) ? "Frasa" : "Kata");

/** An expression with its operators and quoted phrases set apart, so it reads at a glance. */
function Expression({ text }: { text: string }) {
  const parts = text.split(/(\s+(?:and|or)\s+|"[^"]*"|[()])/i).filter(Boolean);
  return (
    <code className={c.expr}>
      {parts.map((p, i) => /^\s*(and|or)\s*$/i.test(p) ? <b key={i} data-op>{` ${p.trim().toUpperCase()} `}</b>
        : p.startsWith('"') ? <span key={i} data-phrase>{p}</span>
        : /^[()]$/.test(p) ? <span key={i} data-paren>{p}</span>
        : <span key={i}>{p}</span>)}
    </code>
  );
}

function Count({ n, loading }: { n: number | null | undefined; loading: boolean }) {
  if (n === undefined) return <span className={c.muted} title="Simpan dulu untuk menghitung">—</span>;
  if (loading && n === null) return <i className={c.skeleton} aria-label="Menghitung" />;
  return n === null ? <span className={c.muted}>—</span> : <span className={c.num} data-zero={n === 0 || undefined}>{formatNumber(n)}</span>;
}

export function KeywordTable({ keyId, scope, saved, onChange, groups, onGroupsChange, disabled }: {
  keyId: string; scope: KeyScope; saved: string[]; onChange: (scope: KeyScope) => void;
  groups: KeywordGroups; onGroupsChange: (groups: KeywordGroups) => void; disabled?: boolean;
}) {
  const [draftGroup, setDraftGroup] = useState("");
  const names = groupNames(scope.keywords, groups);
  const setGroup = (k: string, name: string) => {
    const next = { ...groups };
    if (name.trim()) next[k] = name.replace(/\s+/g, " ").trim(); else delete next[k];
    onGroupsChange(next);
  };
  const [range, setRange] = useState<Range>("30");
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const counts = useApi<CountsResponse>(`/api/admin/projects/${keyId}/keyword-counts?days=${range}`);
  const byKeyword = useMemo(() => new Map((counts.data?.keywords ?? []).map((k) => [k.keyword, k])), [counts.data]);
  const pending = !!counts.data?.pending;
  const loading = (!counts.data && !counts.error) || pending;
  // A long list is counted in the background (one query per keyword): ask again until the numbers are there.
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => void counts.reload(), 15_000);
    return () => clearTimeout(timer);
  }, [pending, counts]);
  const social = !scope.types.length || scope.types.includes("social");
  const online = !scope.types.length || scope.types.includes("online");

  const value = draft.trim().toLowerCase();
  const problem = !value ? null : value.length < 2 ? "Minimal 2 karakter" : value.length > 200 ? "Maksimal 200 karakter"
    : scope.keywords.includes(value) ? "Kata kunci ini sudah ada" : keywordProblem(value);
  const add = () => {
    if (!value || problem || disabled) return;
    onChange({ ...scope, keywords: [...scope.keywords, value] });
    if (draftGroup.trim()) setGroup(value, draftGroup);
    setDraft("");
    setQuery("");
    setPage(Math.ceil((scope.keywords.length + 1) / PAGE_SIZE));
  };
  const remove = (k: string) => onChange({ ...scope, keywords: scope.keywords.filter((x) => x !== k) });

  // Listed group by group (groups in list order, ungrouped last), so a page shows whole groups as far as it can.
  const ordered = groupKeywords(scope.keywords, groups).flatMap((g) => g.keywords);
  const rows = ordered.filter((k) => !query || k.includes(query.trim().toLowerCase()) || (groups[k] ?? "").toLowerCase().includes(query.trim().toLowerCase()));
  const groupCount = new Map((counts.data?.groups ?? []).map((g) => [g.name, g]));
  const groupSize = new Map(groupKeywords(scope.keywords, groups).map((g) => [g.name, g.keywords.length]));
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const shown = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const total = counts.data?.total;

  return (
    <div className={c.wrap}>
      <div className={c.add}>
        <TextInput classNames={{ input: c.addInput, error: c.addError }} value={draft} disabled={disabled} maxLength={200}
          onChange={(e) => setDraft(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder='Tambah kata kunci, frasa, atau ekspresi, mis. (polres OR polsek) AND "urus skck"' error={problem}
          leftSection={<IconPlus size={16} />} aria-label="Kata kunci baru" />
        <Autocomplete classNames={{ input: c.addInput }} value={draftGroup} onChange={setDraftGroup} data={names} disabled={disabled} maxLength={60}
          placeholder="Kelompok (opsional)" leftSection={<IconFolder size={15} />} aria-label="Kelompok kata kunci baru" w={220} />
        <Button onDark variant="secondary" icon={IconPlus} disabled={!value || !!problem || disabled} onClick={add}>Tambah</Button>
      </div>
      <p className={c.help}>
        Kata dan frasa dicocokkan menurut kata dasar (<em>pengaduan</em> juga cocok dengan <em>mengadu</em>). Ekspresi memakai
        <b> AND</b> / <b>OR</b> dan tanda kurung; frasa di dalamnya diberi tanda kutip. Post masuk bila cocok dengan salah satu kata kunci.
      </p>

      <div className={c.toolbar}>
        <div className={c.summary}>
          <b>{formatNumber(scope.keywords.length)}</b> kata kunci
          {total && <> · {social && <><IconBrandX size={13} /> {formatNumber(total.social ?? 0)}</>} {online && <><IconArticle size={13} /> {formatNumber(total.online ?? 0)}</>} <small>dalam {range} hari, tanpa duplikat</small></>}
        </div>
        <div className={c.tools}>
          {scope.keywords.length > PAGE_SIZE && (
            <TextInput classNames={{ input: c.search }} size="xs" value={query} onChange={(e) => { setQuery(e.currentTarget.value); setPage(1); }}
              placeholder="Cari kata kunci" leftSection={<IconSearch size={13} />} aria-label="Cari kata kunci" />
          )}
          <Segmented<Range> value={range} options={RANGE_OPTIONS} onChange={setRange} label="Rentang hitungan" />
        </div>
      </div>

      <div className={c.table} role="table" aria-label="Daftar kata kunci">
        <div className={c.head} role="row">
          <span role="columnheader">#</span>
          <span role="columnheader">Kata kunci</span>
          <span role="columnheader">Jenis</span>
          <span role="columnheader">Kelompok</span>
          <span role="columnheader" className={c.right}>Media sosial</span>
          <span role="columnheader" className={c.right}>Berita</span>
          <span role="columnheader" aria-label="Aksi" />
        </div>
        {!shown.length && <div className={c.empty}>{scope.keywords.length ? "Tidak ada kata kunci yang cocok dengan pencarian." : "Belum ada kata kunci. Proyek ini membaca seluruh bank data."}</div>}
        {shown.map((k, i) => {
          const n = saved.includes(k) ? byKeyword.get(k) : undefined;
          const unsaved = !saved.includes(k);
          const group = groups[k] ?? UNGROUPED;
          // A heading where a group starts on this page; its total counts each post once.
          const heading = names.length > 0 && (i === 0 || (groups[shown[i - 1]] ?? UNGROUPED) !== group);
          const total = groupCount.get(group);
          return (
            <div key={k} role="rowgroup">
            {heading && (
              <div className={c.groupHead} role="row">
                <span role="cell"><IconFolder size={14} /><b>{group}</b><small>{formatNumber(groupSize.get(group) ?? 0)} kata kunci</small></span>
                <span role="cell" className={c.right} data-label="Sosial">{social && <Count n={total ? total.social : loading ? null : undefined} loading={loading} />}</span>
                <span role="cell" className={c.right} data-label="Berita">{online && <Count n={total ? total.online : loading ? null : undefined} loading={loading} />}</span>
              </div>
            )}
            <div className={c.row} role="row" data-new={unsaved || undefined}>
              <span className={c.index} role="cell">{scope.keywords.indexOf(k) + 1}</span>
              <span className={c.keyword} role="cell">
                {isKeywordExpression(k) ? <Expression text={k} /> : <span className={c.word}>{k}</span>}
                {unsaved && <small className={c.badgeNew}>belum disimpan</small>}
              </span>
              <span role="cell"><span className={c.kind} data-kind={kindOf(k)}>{kindOf(k)}</span></span>
              <span role="cell">
                <input className={c.groupInput} list={`groups-${keyId}`} defaultValue={groups[k] ?? ""} key={`${k}|${groups[k] ?? ""}`} disabled={disabled}
                  placeholder="—" aria-label={`Kelompok untuk ${k}`} maxLength={60}
                  onBlur={(e) => { if (e.currentTarget.value.trim() !== (groups[k] ?? "")) setGroup(k, e.currentTarget.value); }}
                  onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
              </span>
              {/* A media type the project does not read shows "—" (null). */}
              <span role="cell" className={c.right} data-label="Sosial"><Count n={unsaved ? undefined : social ? (n ? n.social : null) : null} loading={loading && social} /></span>
              <span role="cell" className={c.right} data-label="Berita"><Count n={unsaved ? undefined : online ? (n ? n.online : null) : null} loading={loading && online} /></span>
              <span role="cell" className={c.right}>
                <button type="button" className={c.remove} onClick={() => remove(k)} disabled={disabled} aria-label={`Hapus kata kunci ${k}`} title="Hapus"><IconTrash size={15} /></button>
              </span>
            </div>
            </div>
          );
        })}
      </div>
      <datalist id={`groups-${keyId}`}>{names.map((n) => <option key={n} value={n} />)}</datalist>

      <div className={c.foot}>
        <small>{counts.error ? "Jumlah post belum bisa dihitung, coba lagi nanti."
          : pending ? `Menghitung ${formatNumber(scope.keywords.length)} kata kunci di latar belakang (beberapa menit untuk daftar panjang); angka muncul sendiri.`
          : `Jumlah post sejak ${counts.data ? new Date(`${counts.data.from}T00:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : "…"} · sesuai cakupan proyek · diperbarui tiap 10 menit`}</small>
        {pages > 1 && <Pagination size="sm" radius="md" total={pages} value={current} onChange={setPage} classNames={{ control: c.pageControl }} />}
      </div>
    </div>
  );
}
