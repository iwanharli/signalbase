import { MediaVisualBoard } from "@/components/mediaVisual/MediaVisualBoard";
import { clientToProject } from "@/lib/server/projectPages";

/** Whole bank (staff). Clients are sent to /projects/<id>/analysis/media. */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (await clientToProject("/analysis/media", await searchParams, null, "Media visual")) ?? <MediaVisualBoard />;
}
