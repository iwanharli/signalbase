import { notFound } from "next/navigation";
import { MediaBrowser } from "@/components/media/MediaBrowser";
import { isMediaType } from "@/lib/media/types";

export default async function MediaPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  if (!isMediaType(type)) notFound();
  return <MediaBrowser key={type} type={type} />;
}
