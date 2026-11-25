import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PricingPage } from "@/components/pricing/PricingPage";
import { PRICING_PUBLIC } from "@/components/pricing/plans";

export const metadata: Metadata = {
  title: "Harga — Signalbase",
  description: "Paket Signalbase: mulai gratis, lalu pilih Starter, Pro, atau Instansi sesuai jumlah keyword, riwayat data, dan kebutuhan AI Anda.",
  robots: { index: PRICING_PUBLIC, follow: PRICING_PUBLIC },
};

export default function Page() {
  if (!PRICING_PUBLIC) notFound();
  return <PricingPage />;
}
