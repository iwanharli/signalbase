import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/auth";
import { roleOf } from "@/lib/session";
import { KeyClassifier } from "@/components/ai/KeyClassifier";

export default async function KeyClassifierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Viewers are read-only: no AI categorisation settings.
  const session = await getSession();
  if (session && roleOf(session) === "viewer") redirect(`/api-keys/${id}`);
  return <KeyClassifier keyId={id} />;
}
