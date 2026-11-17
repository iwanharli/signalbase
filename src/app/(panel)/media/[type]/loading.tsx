"use client";
// Shown while the media page itself loads (e.g. a user's key lookup): the page's bars and a grid of card placeholders.
import { useParams } from "next/navigation";
import { SkeletonGrid } from "@/components/media/CardSkeleton";
import c from "@/components/media/skeleton.module.css";

const bar = (width: number | string, height = 11, extra = "") => <span className={`${c.sk} ${extra}`} style={{ width, height }} />;

export default function MediaLoading() {
  const type = useParams<{ type: string }>().type === "online" ? "online" : "social";
  return (
    <div className={c.bars} aria-busy>
      <div className={c.stats}>
        <div>
          <div className={c.row}>{bar(32, 32)}{bar(110, 14)}<span style={{ flex: 1 }} />{bar(120, 28)}{bar(48, 28)}</div>
          <div className={c.row}>{bar(110, 22)}{bar(110, 22)}{bar(90, 22)}{bar(100, 22)}</div>
        </div>
        <div>{bar("30%", 10)}{bar("100%", 10)}<div className={c.row}>{bar(70, 9)}{bar(60, 9)}{bar(60, 9)}{bar(80, 9)}</div></div>
      </div>
      <div className={c.quick}>{bar(150, 38, c.control)}<span className={`${c.sk} ${c.control}`} style={{ flex: 1 }} />{bar(270, 38, c.control)}{bar(160, 38, c.control)}{bar(210, 38, c.control)}</div>
      <SkeletonGrid type={type} />
    </div>
  );
}
