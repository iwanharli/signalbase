import { PageEnter } from "@/components/landing/PageEnter";

// A template (unlike a layout) remounts on every navigation, so each public page plays its entrance once.
export default function Template({ children }: { children: React.ReactNode }) {
  return <PageEnter>{children}</PageEnter>;
}
