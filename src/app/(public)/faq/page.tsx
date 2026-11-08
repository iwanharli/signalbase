import type { Metadata } from "next";
import { PageHeader } from "@/components/landing/decor";
import { Cta, Faq } from "@/components/landing/sections";

export const metadata: Metadata = {
  title: "Pertanyaan umum — Signalbase",
  description: "Jawaban seputar Signalbase: kategori AI, integrasi API, analisis konten, penyedia AI, dan kendali akses.",
};

export default function Page() {
  return (
    <>
      <PageHeader label="PERTANYAAN UMUM" title="Jawaban untuk" accent="pertanyaan Anda."
        text="Hal-hal yang perlu diketahui sebelum menghubungkan Signalbase ke alur kerja Anda. Pertanyaan soal harga ada di halaman Harga." />
      <Faq />
      <Cta />
    </>
  );
}
