import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LandingPage } from "@/components/landing/LandingPage";
import { COOKIE, verifySession } from "@/lib/session";
export const metadata: Metadata = {
  title: "Signalbase — Temukan sinyal di balik percakapan",
  description: "Jelajahi media sosial dan berita, pahami konteks dengan AI, dan hubungkan data yang relevan ke aplikasi Anda melalui API Signalbase.",
  robots: { index: true, follow: true },
};
// Signed-in accounts go straight to their panel home; everyone else sees the public landing page.
export default async function Page() {
  if (await verifySession((await cookies()).get(COOKIE)?.value)) redirect("/dashboard");
  return <LandingPage />;
}
