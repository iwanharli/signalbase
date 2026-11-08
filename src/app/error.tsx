"use client";
// Errors in any page outside the panel and public layouts (login, register, ...).
import { ErrorScreen } from "@/components/errors/ErrorScreen";
import { errorKind } from "@/components/errors/errorKind";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen kind={errorKind(error)} digest={error.digest} onRetry={reset} />;
}
