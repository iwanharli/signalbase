"use client";
// Peringatan dini: the three biggest issues of social media (the project's post clusters) and of online news, each
// opening its page (Isu media sosial / Isu). Social clusters exist per project only, so the whole bank shows news only.
import Link from "next/link";
import { Skeleton } from "@mantine/core";
import { IconArrowRight, IconMessages, IconTrendingUp, IconWorldWww } from "@tabler/icons-react";
import type { IssueSummary } from "@/lib/issues";
import { formatNumber } from "@/lib/media/labels";
import { useApi } from "@/lib/useApi";
import c from "./insights.module.css";

const SHOWN = 3;
type Cluster = { id: string; title: string | null; keywords: string[]; posts: number; authors: number; negShare: number; growth: number };

export function TopIssues({ keyId, period, social, online }: { keyId: string | null; period: number; social: boolean; online: boolean }) {
  const withKey = keyId ? `key=${encodeURIComponent(keyId)}` : "";
  const clusters = useApi<{ issues: Cluster[] }>(social && keyId ? `/api/admin/isu-klaster?${withKey}` : null);
  const news = useApi<{ issues: IssueSummary[] }>(online ? `/api/admin/issues?days=${period}&topik=nasional${withKey ? `&${withKey}` : ""}` : null);
  const showSocial = social && !!keyId;
  if (!showSocial && !online) return null;
  return (
    <div className={c.topIssues} data-cols={showSocial && online ? 2 : 1}>
      {showSocial && (
        <IssueColumn icon={IconMessages} title="Isu media sosial" more={`/isu/ews?${withKey}`} loading={!clusters.data && !clusters.error}
          empty="Belum ada isu media sosial yang terbentuk."
          rows={(clusters.data?.issues ?? []).slice(0, SHOWN).map((i) => ({
            id: i.id, title: i.title || i.keywords.slice(0, 4).join(", "), href: `/isu/ews?${withKey}&issue=${encodeURIComponent(i.id)}`,
            meta: `${formatNumber(i.posts)} post · ${formatNumber(i.authors)} akun · ${Math.round(i.negShare * 100)}% negatif`,
            hot: i.growth >= 1.5,
          }))} />
      )}
      {online && (
        <IssueColumn icon={IconWorldWww} title="Isu media online" more={`/isu?${withKey ? `${withKey}&` : ""}days=${period}`} loading={!news.data && !news.error}
          empty={`Belum ada isu berita dalam ${period} hari terakhir.`}
          rows={(news.data?.issues ?? []).slice(0, SHOWN).map((i) => ({
            id: i.id, title: i.label || i.title, href: `/isu?${withKey ? `${withKey}&` : ""}days=${period}&issue=${encodeURIComponent(i.id)}`,
            meta: `${formatNumber(i.newsCount)} berita${i.active ? " · masih berkembang" : ""}`,
            hot: i.active,
          }))} />
      )}
    </div>
  );
}

function IssueColumn({ icon: Icon, title, more, rows, loading, empty }: {
  icon: typeof IconMessages; title: string; more: string; loading: boolean; empty: string;
  rows: { id: string; title: string; href: string; meta: string; hot: boolean }[];
}) {
  return (
    <div className={c.issueCol}>
      <div className={c.postsHead}>
        <span className={c.issueColTitle}><Icon size={15} />{title}</span>
        <Link href={more}>Lihat semua <IconArrowRight size={13} /></Link>
      </div>
      {loading ? <div className={c.issueList}>{[0, 1, 2].map((i) => <Skeleton key={i} h={64} radius="md" />)}</div>
        : !rows.length ? <p className={c.issueEmpty}>{empty}</p>
        : (
          <ol className={c.issueList}>
            {rows.map((r, i) => (
              <li key={r.id}>
                <Link href={r.href} className={c.issueItem}>
                  <span className={c.issueRank}>{i + 1}</span>
                  <span className={c.issueBody}>
                    <b>{r.title}</b>
                    <small>{r.meta}</small>
                  </span>
                  {r.hot && <span className={c.issueHot} title="Sedang naik"><IconTrendingUp size={14} /></span>}
                </Link>
              </li>
            ))}
          </ol>
        )}
    </div>
  );
}
