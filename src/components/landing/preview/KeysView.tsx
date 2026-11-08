"use client";
// Preview of /api-keys: dark hero with counts, then the key table with Aktif/Dicabut tabs and search.
import { IconKey, IconPlugConnected, IconSearch, IconSparkles } from "@tabler/icons-react";
import { KEY_ROWS } from "./data";
import c from "./preview.module.css";

const VISIBLE_KEYWORDS = 3;

function KeyRow({ row, index }: { row: (typeof KEY_ROWS)[number]; index: number }) {
  const extra = row.keywords.length - VISIBLE_KEYWORDS;
  return (
    <div className={c.trow} style={{ animationDelay: `${index * 80}ms` }}>
      <div className={c.nameCell}>
        <span className={c.rowIcon} data-live={row.live || undefined}><IconPlugConnected size={14} /></span>
        <div><b>{row.name}</b><small>{row.prefix}••••</small></div>
      </div>
      <div className={c.chips}>
        {row.keywords.slice(0, VISIBLE_KEYWORDS).map((w) => <span key={w}>{w}</span>)}
        {extra > 0 && <em>+{extra}</em>}
      </div>
      <div className={c.mutedCell}>{row.scope}</div>
      <div>
        {row.ai ? (
          <span className={c.aiCell}>
            <span className={c.statusPill} data-on={row.ai[0] || undefined}>{row.ai[0] ? "Aktif" : "Dijeda"}</span>
            <small>{row.ai[1]} item</small>
          </span>
        ) : <span className={c.mutedCell}>—</span>}
      </div>
      <div className={c.creator}><i>{row.by.charAt(0).toUpperCase()}</i>{row.by}</div>
      <div className={c.mutedCell}>{row.used}</div>
    </div>
  );
}

export function KeysView() {
  const withAi = KEY_ROWS.filter((k) => k.ai).length;
  return (
    <>
      <section className={c.hero} data-compact>
        <div className={c.heroGrid} aria-hidden />
        <div className={c.heroText}>
          <span className={c.badge}><IconKey size={11} />Akses API</span>
          <h3>Kunci <em>API</em></h3>
          <p className={c.heroDesc}>Kelola akses aplikasi Anda ke bank data media. Setiap kunci memiliki cakupan data dan kategorisasi AI tersendiri.</p>
        </div>
        <div className={c.heroSide}>
          <div className={c.keyStats}>
            <div><b>{KEY_ROWS.length}</b><span>Aktif</span></div>
            <div><b>2</b><span>Dipakai 24 jam</span></div>
            <div><b>{withAi}</b><span>Dengan AI</span></div>
          </div>
          <span className={c.primaryBtn}><IconKey size={14} />Buat kunci</span>
        </div>
      </section>

      <section className={c.list}>
        <div className={c.toolbar}>
          <div className={c.tabs}><span data-active>Aktif<i>{KEY_ROWS.length}</i></span><span>Dicabut<i>0</i></span></div>
          <span className={c.listSearch}><IconSearch size={13} />Cari nama, prefix, atau kata kunci</span>
        </div>
        <div className={c.thead}>
          <span>Kunci</span><span>Kata kunci</span><span>Cakupan</span><span><IconSparkles size={11} />AI</span><span>Pembuat</span><span>Terakhir dipakai</span>
        </div>
        {KEY_ROWS.map((row, i) => <KeyRow key={row.name} row={row} index={i} />)}
      </section>
    </>
  );
}
