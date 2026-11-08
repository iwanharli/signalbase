// Public pricing page at /pricing: plans, a full comparison, FAQ and a call to action.
// Nav and footer come from the public layout; base styles from landing.module.css.
import Link from "next/link";
import { IconArrowUpRight, IconCheck, IconChevronDown, IconFileDownload, IconMinus } from "@tabler/icons-react";
import { SectionTitle } from "../landing/decor";
import landing from "../landing/landing.module.css";
import { PlanGrid } from "./PlanGrid";
import { BROCHURE_FILENAME, BROCHURE_URL, COMPARISON, COMPARISON_COLUMNS, PRICING_FAQS, TRIAL } from "./plans";
import c from "./pricing.module.css";

function Cell({ value }: { value: string | boolean }) {
  if (value === true) return <IconCheck size={17} className={c.yes} aria-label="Termasuk" />;
  if (value === false) return <IconMinus size={17} className={c.no} aria-label="Tidak termasuk" />;
  return <>{value}</>;
}

export function PricingPage() {
  return (
    <>
        <section className={c.hero}>
          <div className={c.heroGlow} aria-hidden />
          <span className={landing.eyebrow}>HARGA</span>
          <h1>Paket yang tumbuh <em>bersama kebutuhan Anda.</em></h1>
          <p>Coba hampir semua fitur Pro selama {TRIAL.days} hari tanpa biaya. Setelah itu pilih paket sesuai jumlah isu yang Anda pantau, panjang riwayat, dan kebutuhan analisisnya.</p>
          <PlanGrid />
          <p className={c.note}>Harga belum termasuk PPN. Semua akun ditinjau admin sebelum aktif.</p>
          <a href={BROCHURE_URL} download={BROCHURE_FILENAME} className={c.download}><IconFileDownload size={18} />Unduh product knowledge (PDF)</a>
        </section>

        <section className={`${landing.section} ${landing.reveal}`}>
          <SectionTitle label="PERBANDINGAN LENGKAP" title="Lihat detail setiap paket." />
          <div className={c.tableWrap}>
            <table className={c.table}>
              <thead>
                <tr><th scope="col"><span className={c.srOnly}>Fitur</span></th>{COMPARISON_COLUMNS.map((name) => <th key={name} scope="col" data-featured={name === "Pro" || undefined} data-trial={name.startsWith("Trial") || undefined}>{name}</th>)}</tr>
              </thead>
              {COMPARISON.map((group) => (
                <tbody key={group.group}>
                  <tr className={c.groupRow}><th scope="rowgroup" colSpan={COMPARISON_COLUMNS.length + 1}>{group.group}</th></tr>
                  {group.rows.map((row) => (
                    <tr key={row.label}>
                      <th scope="row">{row.label}</th>
                      {row.values.map((v, i) => <td key={i} data-featured={COMPARISON_COLUMNS[i] === "Pro" || undefined}><Cell value={v} /></td>)}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        </section>

        <section className={`${landing.section} ${landing.faq} ${landing.reveal}`}>
          <SectionTitle label="PERTANYAAN SEPUTAR HARGA" title="Sebelum memilih paket." text="Belum menemukan jawabannya? Daftar dan tim kami akan menghubungi Anda saat meninjau akun." />
          <div>
            {PRICING_FAQS.map(([q, a], i) => (
              <details key={q} open={i === 0}>
                <summary>{q}<IconChevronDown size={18} /></summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className={`${c.cta} ${landing.reveal}`}>
          <h2>Siap menemukan sinyal Anda?</h2>
          <p>Mulai trial {TRIAL.days} hari, tentukan keyword, dan lihat percakapan yang relevan dalam hitungan menit setelah akun disetujui.</p>
          <div>
            <Link href={TRIAL.cta.href} className={landing.primary}>{TRIAL.cta.label} <IconArrowUpRight size={18} /></Link>
            <Link href="/" className={landing.secondary}>Kembali ke beranda</Link>
          </div>
        </section>
    </>
  );
}
