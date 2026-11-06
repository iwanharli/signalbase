"use client";
import Link from "next/link";
import { Badge, Card, Group, Progress, SimpleGrid, Skeleton, Stack, Text } from "@mantine/core";
import { IconArrowRight, IconCircleCheck, IconCircleX, IconKey, IconLayoutDashboard, IconMessages, IconWorldWww } from "@tabler/icons-react";
import { useApi } from "@/lib/useApi";
import { moodInfo } from "@/lib/mood";
import { PageHeader } from "./PageHeader";

type Stats = {
  sosial: { approved: number; rejected: number }; online: { approved: number; rejected: number };
  today: { approved: number; rejected: number }; daily: { day: string; n: number }[]; keys: number;
  moods: { type: string; mood: string | null; n: number }[];
};
const fmt = (n: number) => n.toLocaleString("id-ID");

function Stat({ label, value, icon: I, color, hint }: { label: string; value: number | undefined; icon: typeof IconKey; color: string; hint: string }) {
  return (
    <Card p="lg">
      <Group justify="space-between" align="flex-start">
        <div>
          <Text fz={13} c="dimmed" fw={600}>{label}</Text>
          {value == null ? <Skeleton h={32} w={80} mt={6} /> : <Text fz={30} fw={800} lh={1.2} mt={4}>{fmt(value)}</Text>}
          <Text fz={12} c="dimmed" mt={4}>{hint}</Text>
        </div>
        <I size={28} color={`var(--mantine-color-${color}-6)`} stroke={1.6} />
      </Group>
    </Card>
  );
}

function TypeCard({ type, label, icon: I, data, moods }: { type: string; label: string; icon: typeof IconKey; data?: { approved: number; rejected: number }; moods: Stats["moods"] }) {
  const own = moods.filter((m) => m.type === type && m.mood).sort((a, b) => b.n - a.n);
  const total = own.reduce((t, m) => t + m.n, 0);
  return (
    <Card p="lg">
      <Group justify="space-between" mb="md">
        <Group gap="sm"><I size={22} /><Text fw={700}>{label}</Text></Group>
        <Link href={`/kurasi/${type}`} style={{ fontSize: 13, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}>Buka antrean <IconArrowRight size={14} /></Link>
      </Group>
      <Group gap="xl" mb="md">
        <div><Text fz={24} fw={800} c="teal.7">{data ? fmt(data.approved) : "–"}</Text><Text fz={12} c="dimmed">Disetujui</Text></div>
        <div><Text fz={24} fw={800} c="red.7">{data ? fmt(data.rejected) : "–"}</Text><Text fz={12} c="dimmed">Ditolak</Text></div>
      </Group>
      <Text fz={12} fw={700} c="dimmed" mb={6}>{type === "sosial" ? "Emosi" : "Sentimen"} data terbit</Text>
      {total ? (
        <Stack gap={6}>
          {own.slice(0, 5).map((m) => {
            const info = moodInfo(m.mood!);
            return (
              <div key={m.mood}>
                <Group justify="space-between" mb={2}><Text fz={13}>{info.label}</Text><Text fz={12} c="dimmed">{fmt(m.n)} · {Math.round((m.n / total) * 100)}%</Text></Group>
                <Progress value={(m.n / total) * 100} color={info.color} size="sm" />
              </div>
            );
          })}
        </Stack>
      ) : <Text fz={13} c="dimmed">Belum ada data yang disetujui.</Text>}
    </Card>
  );
}

export function Overview() {
  const { data } = useApi<Stats>("/api/admin/stats");
  const max = Math.max(1, ...(data?.daily ?? []).map((d) => d.n));
  return (
    <>
      <PageHeader icon={IconLayoutDashboard} title="Ringkasan" subtitle="Status kurasi bank data media" />
      <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} mb="lg">
        <Stat label="Terbit" value={data ? data.sosial.approved + data.online.approved : undefined} icon={IconCircleCheck} color="teal" hint="Bisa dibaca aplikasi lain" />
        <Stat label="Ditolak" value={data ? data.sosial.rejected + data.online.rejected : undefined} icon={IconCircleX} color="red" hint="Tidak diteruskan" />
        <Stat label="Dikurasi hari ini" value={data ? data.today.approved + data.today.rejected : undefined} icon={IconLayoutDashboard} color="violet" hint={data ? `${fmt(data.today.approved)} disetujui · ${fmt(data.today.rejected)} ditolak` : " "} />
        <Stat label="Kunci API aktif" value={data?.keys} icon={IconKey} color="cyan" hint="Aplikasi yang terhubung" />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, md: 2 }} mb="lg">
        <TypeCard type="sosial" label="Media Sosial" icon={IconMessages} data={data?.sosial} moods={data?.moods ?? []} />
        <TypeCard type="online" label="Media Online" icon={IconWorldWww} data={data?.online} moods={data?.moods ?? []} />
      </SimpleGrid>
      <Card p="lg">
        <Group justify="space-between" mb="md"><Text fw={700}>Persetujuan 14 hari terakhir</Text><Badge variant="light">{fmt((data?.daily ?? []).reduce((t, d) => t + d.n, 0))} item</Badge></Group>
        {data && !data.daily.length ? <Text fz={13} c="dimmed">Belum ada aktivitas.</Text> : (
          <Group align="flex-end" gap={6} h={140} wrap="nowrap">
            {(data?.daily ?? []).map((d) => (
              <Stack key={d.day} gap={4} align="center" style={{ flex: 1, minWidth: 0 }}>
                <Text fz={11} c="dimmed">{d.n}</Text>
                <div title={`${d.day}: ${d.n}`} style={{ width: "100%", maxWidth: 36, height: `${(d.n / max) * 100}px`, minHeight: 3, borderRadius: 6, background: "linear-gradient(180deg, var(--mantine-color-violet-5), var(--mantine-color-cyan-5))" }} />
                <Text fz={10} c="dimmed">{d.day.slice(8)}/{d.day.slice(5, 7)}</Text>
              </Stack>
            ))}
          </Group>
        )}
      </Card>
    </>
  );
}
