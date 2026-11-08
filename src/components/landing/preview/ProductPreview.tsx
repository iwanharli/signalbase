"use client";
// Interactive mock of the real Signalbase panel for the landing page: a browser frame around the panel's top bar
// and one of three views (same layout as /dashboard, /media/social and /api-keys). All data is made up (data.ts).
import { useState } from "react";
import { IconBook2, IconKey, IconLayoutDashboard, IconMessages, IconWorldWww } from "@tabler/icons-react";
import { LogoMark } from "../../Logo";
import { HomeView } from "./HomeView";
import { KeysView } from "./KeysView";
import { MediaView } from "./MediaView";
import c from "./preview.module.css";

type View = "home" | "social" | "keys";

const VIEWS: Record<View, { path: string; render: () => React.ReactNode }> = {
  home: { path: "dashboard", render: () => <HomeView /> },
  social: { path: "media/social", render: () => <MediaView /> },
  keys: { path: "api-keys", render: () => <KeysView /> },
};

/** The panel's menu; entries without a view are shown but not clickable. */
const NAV: { view: View | null; icon: typeof IconMessages; label: string }[] = [
  { view: "home", icon: IconLayoutDashboard, label: "Beranda" },
  { view: "social", icon: IconMessages, label: "Media Sosial" },
  { view: null, icon: IconWorldWww, label: "Media Online" },
  { view: "keys", icon: IconKey, label: "Proyek" },
];

export function ProductPreview() {
  const [view, setView] = useState<View>("home");
  return (
    <div className={c.window}>
      <div className={c.browser}>
        <span className={c.dots}><i /><i /><i /></span>
        <span className={c.url}>signalbase.id/{VIEWS[view].path}</span>
      </div>

      <div className={c.app}>
        <div className={c.bar}>
          <span className={c.brand}><LogoMark size={22} /><span>Signal<b>base</b></span></span>
          <nav className={c.nav} aria-label="Pratinjau navigasi">
            {NAV.map(({ view: target, icon: Icon, label }) => target ? (
              <button key={label} type="button" className={c.link} data-active={view === target || undefined} onClick={() => setView(target)}>
                <Icon size={14} /><span>{label}</span>
              </button>
            ) : (
              <span key={label} className={c.link} data-disabled><Icon size={14} /><span>{label}</span></span>
            ))}
          </nav>
          <span className={c.right}>
            <span className={c.plan}><b>Pro</b>12 hari</span>
            <span className={c.tool}><IconBook2 size={14} /></span>
            <span className={c.user}><i>R</i><span>Rina</span></span>
          </span>
        </div>
        {/* Keyed by view so each switch replays the entrance animation. */}
        <div className={c.page} key={view}>{VIEWS[view].render()}</div>
      </div>

      <div className={c.caption}><span><i />Klik Beranda, Media Sosial, atau Proyek untuk melihat tiap halaman.</span></div>
    </div>
  );
}
