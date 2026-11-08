import type { Metadata } from "next";
import { ErrorScreen } from "@/components/errors/ErrorScreen";

export const metadata: Metadata = { title: "Halaman tidak ditemukan · Signalbase" };

export default function NotFound() {
  return <ErrorScreen kind="notFound" />;
}
