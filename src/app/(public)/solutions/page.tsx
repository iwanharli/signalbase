import type { Metadata } from "next";
import { PageHeader } from "@/components/landing/decor";
import { Cta, Sources, UseCaseSection } from "@/components/landing/sections";

export const metadata: Metadata = {
  title: "Solusi — Signalbase",
  description: "Cara organisasi memakai Signalbase: reputasi dan komunikasi, kebijakan dan layanan publik, serta produk dan pengembangan.",
};

export default function Page() {
  return (
    <>
      <PageHeader label="SOLUSI" title="Satu fondasi," accent="banyak perspektif."
        text="Humas, unit layanan publik, dan tim produk memakai data yang sama untuk pertanyaan yang berbeda." />
      <UseCaseSection />
      <Sources />
      <Cta />
    </>
  );
}
