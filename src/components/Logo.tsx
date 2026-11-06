import { Group, Text } from "@mantine/core";

// Signal mark: concentric arcs from one point (a source, its spreading signal).
export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <defs>
        <linearGradient id="sbg" x1="0" y1="40" x2="40" y2="0">
          <stop offset="0" stopColor="#7c3aed" /><stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="url(#sbg)" />
      <circle cx="13" cy="27" r="3.2" fill="#fff" />
      <path d="M13 18.5a8.5 8.5 0 0 1 8.5 8.5" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M13 11a16 16 0 0 1 16 16" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" opacity=".7" />
    </svg>
  );
}

export function Logo({ light, sub = "Bank Data Media" }: { light?: boolean; sub?: string }) {
  return (
    <Group gap={10} wrap="nowrap">
      <LogoMark />
      <div>
        <Text fw={800} fz={17} lh={1.1} c={light ? "white" : undefined} lts={-0.2}>Signalbase</Text>
        <Text fz={11} lh={1.2} c={light ? "rgba(255,255,255,.55)" : "dimmed"}>{sub}</Text>
      </div>
    </Group>
  );
}
