import type { Metadata } from "next";
import { PageHeader } from "@/components/landing/decor";
import { ControlStrip, Cta, Integration } from "@/components/landing/sections";

export const metadata: Metadata = {
  title: "Integrasi API — Signalbase",
  description: "Ambil konten, ringkasan emosi, dan tren kategori Signalbase lewat API JSON dengan cakupan per kunci.",
};

export default function Page() {
  return (
    <>
      <PageHeader label="INTEGRASI" title="Data Signalbase," accent="langsung di aplikasi Anda."
        text="Setiap kunci API membawa keyword dan cakupannya sendiri. Aplikasi Anda menerima data yang sama dengan yang Anda lihat di panel." />
      <Integration />
      <ControlStrip />
      <Cta />
    </>
  );
}
