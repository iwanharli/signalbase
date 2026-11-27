import type { Metadata } from "next";
import { IntegrationPage } from "@/components/integration/IntegrationPage";

export const metadata: Metadata = {
  title: "Integrasi API — Signalbase",
  description: "REST API Signalbase: endpoint, parameter, field respons, contoh kode cURL, JavaScript, Python, PHP, batas pemakaian, dan kode status.",
};

export default function Page() {
  return <IntegrationPage />;
}
