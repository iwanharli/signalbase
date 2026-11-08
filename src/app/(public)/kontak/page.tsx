import type { Metadata } from "next";
import { IconBuildingSkyscraper, IconHeadset, IconShieldCheck } from "@tabler/icons-react";
import { ContactForm } from "@/components/contact/ContactForm";
import c from "@/components/contact/contact.module.css";
import { PageHeader } from "@/components/landing/decor";

export const metadata: Metadata = {
  title: "Hubungi kami — Signalbase",
  description: "Diskusikan paket Instansi, kebutuhan data khusus, atau integrasi Signalbase dengan tim kami.",
};

const REASONS = [
  { icon: IconBuildingSkyscraper, title: "Paket Instansi", text: "Seluruh arsip, analisis terlengkap, kategorisasi AI dengan model enhancement, dan kunci tanpa batas." },
  { icon: IconHeadset, title: "Pendampingan", text: "Kami bantu menyusun keyword, kategori AI, dan integrasi ke dashboard atau sistem Anda." },
  { icon: IconShieldCheck, title: "Kebutuhan khusus", text: "Cakupan wilayah tertentu, riwayat panjang, SLA, atau penagihan sesuai prosedur pengadaan." },
];

export default function Page() {
  return (
    <>
      <PageHeader label="HUBUNGI KAMI" title="Mari bicarakan" accent="kebutuhan Anda."
        text="Isi formulir berikut. Tim kami akan menghubungi Anda dalam 1–2 hari kerja untuk menyusun penawaran yang sesuai." />
      <div className={c.layout}>
        <div className={c.side}>
          {REASONS.map((r) => <div key={r.title}><r.icon size={24} /><span><b>{r.title}</b><p>{r.text}</p></span></div>)}
        </div>
        <ContactForm />
      </div>
    </>
  );
}
