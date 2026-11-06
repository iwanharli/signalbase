import { notFound } from "next/navigation";
import { Curation } from "@/components/Curation";

export default async function Page({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  if (type !== "sosial" && type !== "online") notFound();
  return <Curation key={type} type={type} />;
}
