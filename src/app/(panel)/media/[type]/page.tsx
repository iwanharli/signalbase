import { notFound } from "next/navigation";
import { MediaBrowser } from "@/components/media/MediaBrowser";
import { isMediaType } from "@/lib/media/types";

export default async function MediaPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  if (!isMediaType(type)) notFound();
  // Keyed by type so switching between the two pages starts with fresh filters.
  return <MediaBrowser key={type} type={type} />;
}
