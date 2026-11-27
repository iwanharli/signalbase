import type { Metadata } from "next";
import { ErrorScreen } from "@/components/errors/ErrorScreen";
import { getSession } from "@/lib/server/auth";

export const metadata: Metadata = { title: "Halaman tidak ditemukan · Signalbase" };

/** Signed in: "Ke beranda" opens the panel's Beranda; visitors go to the home page. */
export default async function NotFound() {
  const session = await getSession();
  return <ErrorScreen kind="notFound" home={session ? { href: "/dashboard", label: "Ke beranda" } : undefined} />;
}
