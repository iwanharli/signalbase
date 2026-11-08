"use client";
// Errors on the public site: the navigation stays.
import { ErrorScreen } from "@/components/errors/ErrorScreen";
import { errorKind } from "@/components/errors/errorKind";

export default function PublicError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen kind={errorKind(error)} digest={error.digest} onRetry={reset} inline />;
}
