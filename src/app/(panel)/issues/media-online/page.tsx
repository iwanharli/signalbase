import { OnlineIssues } from "@/components/issues/OnlineIssues";
import { clientToProject } from "@/lib/server/projectPages";

/** Whole bank (staff). Clients are sent to /projects/<id>/issues/media-online. */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (await clientToProject("/issues/media-online", await searchParams, "online", "Isu Media Online")) ?? <OnlineIssues />;
}
