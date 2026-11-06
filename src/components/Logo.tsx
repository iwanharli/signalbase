"use client";
import { useId } from "react";
import { Group, Text } from "@mantine/core";

// Signal core: a pulse line inside a scanning orbit on a dark squircle with a neon rim.
export function LogoMark({ size = 34, animated }: { size?: number; animated?: boolean }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <defs>
        <linearGradient id={`${id}bg`} x1="0" y1="0" x2="40" y2="40"><stop offset="0" stopColor="#1e1b4b" /><stop offset="1" stopColor="#0d0b1f" /></linearGradient>
        <linearGradient id={`${id}rim`} x1="0" y1="40" x2="40" y2="0"><stop offset="0" stopColor="#7c3aed" /><stop offset="1" stopColor="#22d3ee" /></linearGradient>
        <linearGradient id={`${id}pulse`} x1="7" y1="0" x2="33" y2="0"><stop offset="0" stopColor="#c4b5fd" /><stop offset=".5" stopColor="#fff" /><stop offset="1" stopColor="#67e8f9" /></linearGradient>
        <filter id={`${id}glow`} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <rect x="1" y="1" width="38" height="38" rx="12" fill={`url(#${id}bg)`} stroke={`url(#${id}rim)`} strokeWidth="1.6" />
      <g style={animated ? { transformOrigin: "20px 20px", animation: "sb-orbit 8s linear infinite" } : undefined}>
        <circle cx="20" cy="20" r="12.5" fill="none" stroke={`url(#${id}rim)`} strokeWidth="1.4" strokeDasharray="30 9 6 9" strokeLinecap="round" opacity=".75" />
        <circle cx="32.5" cy="20" r="1.6" fill="#22d3ee" />
      </g>
      <path d="M8 21h5.5l2.6-6.5 4 12.5 3-9 2 3h6.9" fill="none" stroke={`url(#${id}pulse)`} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" filter={`url(#${id}glow)`} />
    </svg>
  );
}

export function Logo({ light, sub = "Bank Data Media" }: { light?: boolean; sub?: string }) {
  return (
    <Group gap={10} wrap="nowrap">
      <LogoMark animated />
      <div>
        <Text fw={800} fz={17} lh={1.1} c={light ? "white" : undefined} lts={-0.2}>Signalbase</Text>
        <Text fz={11} lh={1.2} c={light ? "rgba(255,255,255,.55)" : "dimmed"}>{sub}</Text>
      </div>
    </Group>
  );
}
