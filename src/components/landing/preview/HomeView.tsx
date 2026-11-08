"use client";
// Preview of /dashboard for a user: hero with the key's keywords, volume tiles, per-type panels, latest signals, own keys.
import { IconArrowUpRight, IconEdit, IconKey, IconMessages, IconPlugConnected, IconWorldWww } from "@tabler/icons-react";
import { HOME_KEYS, KEY_NAME, KEYWORDS, LATEST, ONLINE_DAYS, ONLINE_MOODS, SOCIAL_DAYS, SOCIAL_MOODS } from "./data";
import { CountUp, PanelHead, TypePanel } from "./parts";
import c from "./preview.module.css";

/** Illustrative 7-day total from the daily bars (scaled up so the tiles look like real volumes). */
const weekTotal = (days: number[]) => days.slice(6, 13).reduce((t, n) => t + n, 0) * 9;

export function HomeView() {
  return (
    <>
      <section className={c.hero}>
        <div className={c.heroGrid} aria-hidden />
        <div className={c.heroText}>
          <span className={c.badge}><i />Beranda · {KEY_NAME}</span>
          <h3>Sinyal untuk <em>keyword Anda</em></h3>
          <div className={c.heroKw}>
            {KEYWORDS.map((k) => <span key={k}>{k}</span>)}
            <span className={c.heroEdit}><IconEdit size={11} />Ubah</span>
          </div>
          <p>Diperbarui 09.42</p>
        </div>
        <div className={c.tiles}>
          <div className={c.tile} data-tone="violet">
            <span className={c.tileIcon}><IconMessages size={16} /></span>
            <small>Media Sosial · 7 hari</small>
            <b><CountUp value={weekTotal(SOCIAL_DAYS)} /></b>
            <em><IconArrowUpRight size={12} />12,8% vs minggu lalu</em>
          </div>
          <div className={c.tile} data-tone="cyan">
            <span className={c.tileIcon}><IconWorldWww size={16} /></span>
            <small>Media Online · 7 hari</small>
            <b><CountUp value={weekTotal(ONLINE_DAYS)} /></b>
            <em><IconArrowUpRight size={12} />6,4% vs minggu lalu</em>
          </div>
          <div className={c.tile} data-tone="green">
            <span className={c.tileIcon}><IconKey size={16} /></span>
            <small>Proyek Anda</small>
            <b>{HOME_KEYS.length}</b>
            <em>Kelola proyek & keyword</em>
          </div>
        </div>
      </section>

      <div className={c.two}>
        <TypePanel title="Media Sosial" days={SOCIAL_DAYS} moods={SOCIAL_MOODS} kind="Emosi" tone="violet" />
        <TypePanel title="Media Online" days={ONLINE_DAYS} moods={ONLINE_MOODS} kind="Sentimen" tone="cyan" />
      </div>

      <div className={c.two} data-wide>
        <section className={c.panel}>
          <PanelHead title="Sinyal terbaru" text="Post dan berita terbaru yang menyebut keyword proyek ini" />
          <div className={c.feed}>
            {LATEST.map((item, i) => (
              <div key={i} className={c.feedItem} style={{ animationDelay: `${i * 70}ms` }}>
                <span className={c.feedIcon} data-t={item.type}>{item.type === "social" ? <IconMessages size={14} /> : <IconWorldWww size={14} />}</span>
                <span>
                  <b>{item.text}</b>
                  <small>{item.meta} · <em style={{ color: item.mood[1] }}>{item.mood[0]}</em></small>
                </span>
              </div>
            ))}
          </div>
        </section>
        <section className={c.panel}>
          <PanelHead title="Proyek Anda" text="Pilih proyek untuk melihat datanya" />
          {HOME_KEYS.map((k) => (
            <div key={k.name} className={c.keyRow} data-active={k.active || undefined}>
              <span className={c.keyIcon}><IconPlugConnected size={15} /></span>
              <div>
                <b>{k.name}</b>
                <small>{k.used}</small>
                <div className={c.kw}>{k.keywords.map((w) => <span key={w}>{w}</span>)}</div>
              </div>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
