"use client";
// A script chunk that fails to load outside rendering (e.g. a lazy import in a click handler) never reaches an error
// boundary. After a deploy that is the usual cause, so reload once to get the new build.
import { useEffect } from "react";
import { isChunkError, reloadForUpdate } from "./errorKind";

export function ChunkRecovery() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => { if (isChunkError(e.error ?? e.message)) reloadForUpdate(); };
    const onRejection = (e: PromiseRejectionEvent) => { if (isChunkError(e.reason)) reloadForUpdate(); };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => { window.removeEventListener("error", onError); window.removeEventListener("unhandledrejection", onRejection); };
  }, []);
  return null;
}
