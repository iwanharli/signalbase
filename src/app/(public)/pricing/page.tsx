import type { Metadata } from "next";
import { PricingPage } from "@/components/pricing/PricingPage";

export const metadata: Metadata = {
  title: "Harga — Signalbase",
  description: "Paket Signalbase: mulai gratis, lalu pilih Starter, Pro, atau Instansi sesuai jumlah keyword, riwayat data, dan kebutuhan AI Anda.",
  robots: { index: true, follow: true },
};

export default function Page() {
  return <PricingPage />;
}
