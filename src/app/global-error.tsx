"use client";
// Last resort: the root layout itself failed, so this renders its own <html> and has no providers.
import { ErrorScreen } from "@/components/errors/ErrorScreen";
import { errorKind } from "@/components/errors/errorKind";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="id">
      <head><title>Terjadi kesalahan · Signalbase</title></head>
      <body style={{ margin: 0 }}><ErrorScreen kind={errorKind(error)} digest={error.digest} onRetry={reset} /></body>
    </html>
  );
}
