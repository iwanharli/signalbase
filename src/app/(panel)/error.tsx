"use client";
// Errors inside the panel: the top bar stays, only the page area shows the error.
import { ErrorScreen } from "@/components/errors/ErrorScreen";
import { errorKind } from "@/components/errors/errorKind";

export default function PanelError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen kind={errorKind(error)} digest={error.digest} onRetry={reset} inline home={{ href: "/dashboard", label: "Ke Ringkasan" }} />;
}
