import { KeyClassifier } from "@/components/ai/KeyClassifier";

export default async function KeyClassifierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <KeyClassifier keyId={id} />;
}
