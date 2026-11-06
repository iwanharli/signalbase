"use client";
// Styled hover hint used instead of the browser's native `title` tooltip.
import { Tooltip } from "@mantine/core";

export function Tip({ label, children }: { label: React.ReactNode; children: React.ReactElement }) {
  if (!label) return children;
  return <Tooltip label={label} withArrow openDelay={200} position="top" multiline maw={300} radius={10} fz={12.5} zIndex={500}>{children}</Tooltip>;
}
