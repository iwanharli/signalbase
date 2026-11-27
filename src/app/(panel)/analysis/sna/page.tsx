import { SnaBoard } from "@/components/sna/SnaBoard";
import { clientToProject } from "@/lib/server/projectPages";

/** Whole bank (staff). Clients are sent to /projects/<id>/analysis/sna. */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (await clientToProject("/analysis/sna", await searchParams, "social", "Analisis SNA")) ?? <SnaBoard />;
}
