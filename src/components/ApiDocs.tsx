"use client";
import { Badge, Card, Code, Group, Stack, Table, Text, Title } from "@mantine/core";
import { IconBook2 } from "@tabler/icons-react";
import { PageHeader } from "./PageHeader";

const PARAMS = [
  ["from, to", "YYYY-MM-DD", "Rentang tanggal terbit (WIB)"],
  ["q", "teks", "Cari di judul/isi"],
  ["source", "teks", "Platform (twitter, threads, …) atau nama media"],
  ["mood", "teks", "Emosi (sosial) atau sentimen positive/neutral/negative (online)"],
  ["page, size", "angka", "Halaman, isi per halaman (maks. 100, default 24)"],
  ["sort", "newest | oldest", "Urutan tanggal terbit"],
  ["view", "summary", "Hanya total dan sebaran label"],
];

const ITEM = `{
  "page": 1, "pages": 12, "size": 24, "total": 281,
  "items": [{
    "id": "4f0c…", "type": "online", "source": "news-kompas",
    "title": "…", "content": "…", "url": "https://…", "image": "https://…",
    "category": "hukum", "province": "Jawa Timur", "location": null,
    "publishedAt": "2026-11-06T02:38:00.000Z",
    "mood": "negative", "moodLevel": null,
    "metrics": { "likes": null, "comments": null, "shares": null, "views": null }
  }]
}`;

export function ApiDocs() {
  return (
    <>
      <PageHeader icon={IconBook2} title="Dokumentasi API" subtitle="Cara aplikasi lain membaca data yang sudah disetujui" />
      <Stack>
        <Card p="lg">
          <Title order={4} mb="xs">Autentikasi</Title>
          <Text fz={14} mb="sm">Kirim kunci dari halaman Kunci API di setiap permintaan, lewat salah satu header:</Text>
          <Code block>{`Authorization: Bearer sb_xxxxxxxxxxxxxxxx\n# atau\nx-api-key: sb_xxxxxxxxxxxxxxxx`}</Code>
          <Text fz={13} c="dimmed" mt="sm">Kunci yang salah atau sudah dicabut mendapat <Code>401</Code>. Hanya item berstatus disetujui yang bisa dibaca.</Text>
        </Card>
        <Card p="lg">
          <Group gap="sm" mb="sm"><Badge color="teal">GET</Badge><Code fz={14}>/api/v1/media/{"{sosial|online}"}</Code></Group>
          <Table withTableBorder fz={14} mb="md">
            <Table.Thead><Table.Tr><Table.Th>Parameter</Table.Th><Table.Th>Nilai</Table.Th><Table.Th>Keterangan</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>{PARAMS.map(([p, v, d]) => <Table.Tr key={p}><Table.Td><Code>{p}</Code></Table.Td><Table.Td>{v}</Table.Td><Table.Td>{d}</Table.Td></Table.Tr>)}</Table.Tbody>
          </Table>
          <Text fw={600} fz={14} mb={6}>Contoh</Text>
          <Code block mb="md">{`curl -H "Authorization: Bearer $SIGNALBASE_KEY" \\\n  "https://<host>/api/v1/media/online?from=2026-10-01&to=2026-11-06&mood=negative"`}</Code>
          <Text fw={600} fz={14} mb={6}>Respons</Text>
          <Code block>{ITEM}</Code>
          <Text fw={600} fz={14} mt="md" mb={6}>Ringkasan (<Code>view=summary</Code>)</Text>
          <Code block>{`{ "total": 281, "moods": [{ "value": "negative", "n": 130 }, { "value": "neutral", "n": 90 }, { "value": "positive", "n": 61 }] }`}</Code>
          <Text fz={13} c="dimmed" mt="sm">Sebaran mengabaikan filter <Code>mood</Code> agar semua bagian tetap terlihat; <Code>total</Code> tetap mengikutinya.</Text>
        </Card>
        <Card p="lg">
          <Title order={4} mb="xs">Privasi</Title>
          <Text fz={14}>Data tidak memuat nama akun, penulis, atau tautan balik ke post media sosial. Berita online menyertakan tautan sumbernya.</Text>
        </Card>
      </Stack>
    </>
  );
}
