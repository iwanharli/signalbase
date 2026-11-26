"use client";
// Shown while the media page itself loads (e.g. a user's key lookup): the page's bars and a grid of card placeholders.
import { useParams } from "next/navigation";
import { MediaPageSkeleton } from "@/components/media/CardSkeleton";

export default function MediaLoading() {
  return <MediaPageSkeleton type={useParams<{ type: string }>().type === "online" ? "online" : "social"} />;
}
