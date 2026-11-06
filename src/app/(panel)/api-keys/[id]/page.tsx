import { ApiKeyDetail } from "@/components/apiKeys/ApiKeyDetail";

export default async function ApiKeyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ApiKeyDetail keyId={id} />;
}
