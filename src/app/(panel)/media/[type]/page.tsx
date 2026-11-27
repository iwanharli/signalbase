import { notFound } from "next/navigation";
import { MediaBrowser } from "@/components/media/MediaBrowser";
import { isMediaType } from "@/lib/media/types";
import { clientToProject } from "@/lib/server/projectPages";

type Props = { params: Promise<{ type: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Whole bank (staff). Clients are sent to /projects/<id>/media/<type> of a project that reads this media type. */
export default async function MediaPage({ params, searchParams }: Props) {
  const { type } = await params;
  if (!isMediaType(type)) notFound();
  // Keyed by type so switching between the two pages starts with fresh filters.
  return (await clientToProject(`/media/${type}`, await searchParams, type)) ?? <MediaBrowser key={type} type={type} />;
}
