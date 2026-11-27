import { staffOnly } from "@/lib/server/staffOnly";

export default async function ProjectSettingsLayout({ children }: { children: React.ReactNode }) {
  await staffOnly();
  return children;
}
