"use client";
// An analysed image: a plain <img>, or for a video frame ("<video>#t=25%", see videoFrameUrls) a muted <video> paused at
// that point (browsers' own #t= only takes seconds). Same attributes either way, so the page's CSS treats both alike.
import type { ImgHTMLAttributes, SyntheticEvent } from "react";
import { videoFrame } from "@/lib/mediaVisual";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onError"> & { src: string; onError?: () => void; "data-blur"?: boolean };

export function VisualImage({ src, onError, alt = "", loading, referrerPolicy = "no-referrer", className, style, ...rest }: Props) {
  const frame = videoFrame(src);
  if (!frame) {
    // eslint-disable-next-line @next/next/no-img-element -- remote media from many hosts
    return <img src={src} alt={alt} loading={loading} referrerPolicy={referrerPolicy} onError={onError} className={className} style={style} {...rest} />;
  }
  const seek = (e: SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    if (Number.isFinite(v.duration)) v.currentTime = v.duration * frame.at;
  };
  return (
    <video src={frame.url} muted playsInline preload="metadata" aria-label={alt || "Frame video"} onLoadedMetadata={seek} onError={onError}
      className={className} style={style} data-blur={rest["data-blur"]} />
  );
}
