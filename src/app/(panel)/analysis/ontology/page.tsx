import { OntologyBoard } from "@/components/ontology/OntologyBoard";
import { clientToProject } from "@/lib/server/projectPages";

/** Whole bank (staff). Clients are sent to /projects/<id>/analysis/ontology. */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (await clientToProject("/analysis/ontology", await searchParams, "social", "Ontologi")) ?? <OntologyBoard />;
}
