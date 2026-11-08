// Layout for the public legal pages (/syarat, /privasi): header, table of contents, numbered sections.
import Link from "next/link";
import { PageHeader } from "../landing/decor";
import c from "./legal.module.css";

export type LegalSection = { id: string; title: string; body: React.ReactNode };

export function LegalPage({ label, title, accent, lead, updated, sections }: { label: string; title: string; accent: string; lead: string; updated: string; sections: LegalSection[] }) {
  return (
    <>
      <PageHeader label={label} title={title} accent={accent} text={lead} />
      <div className={c.layout}>
        <nav className={c.toc} aria-label="Daftar isi">
          <small>Berlaku sejak {updated}</small>
          {sections.map((s, i) => <a key={s.id} href={`#${s.id}`}><b>{i + 1}</b>{s.title}</a>)}
        </nav>
        <article className={c.body}>
          {sections.map((s, i) => (
            <section key={s.id} id={s.id}>
              <h2><span>{i + 1}</span>{s.title}</h2>
              {s.body}
            </section>
          ))}
          <p className={c.contact}>Pertanyaan tentang dokumen ini? <Link href="/kontak">Hubungi kami</Link>.</p>
        </article>
      </div>
    </>
  );
}
