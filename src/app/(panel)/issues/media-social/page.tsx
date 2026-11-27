import { SocialIssues } from "@/components/issues/SocialIssues";
import { clientToProject } from "@/lib/server/projectPages";

/** Whole bank (staff). Clients are sent to /projects/<id>/issues/media-social. */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (await clientToProject("/issues/media-social", await searchParams, "social", "Isu Media Sosial")) ?? <SocialIssues />;
}
