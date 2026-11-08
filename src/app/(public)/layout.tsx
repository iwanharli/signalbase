import { PublicLayout } from "@/components/landing/PublicLayout";

// Public marketing pages share one nav and footer.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <PublicLayout>{children}</PublicLayout>;
}
