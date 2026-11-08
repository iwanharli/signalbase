import type { Metadata } from "next";
import { PageHeader } from "@/components/landing/decor";
import { AiSection, Cta, Features, Workflow } from "@/components/landing/sections";

export const metadata: Metadata = {
  title: "Fitur — Signalbase",
  description: "Eksplorasi media sosial dan berita, analisis emosi dan isi, serta kategorisasi AI yang mengikuti konteks Anda.",
};

export default function Page() {
  return (
    <>
      <PageHeader label="FITUR" title="Semua yang Anda butuhkan untuk" accent="membaca percakapan."
        text="Dari pencarian pertama sampai kategori AI buatan Anda sendiri, semua fitur Signalbase bekerja di atas satu bank data media." />
      <Features />
      <AiSection />
      <Workflow />
      <Cta />
    </>
  );
}
