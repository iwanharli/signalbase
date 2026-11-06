"use client";
import { useState } from "react";
import { Alert, Badge, Button, Card, CopyButton, Group, Modal, Stack, Table, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconCheck, IconCopy, IconKey, IconPlus } from "@tabler/icons-react";
import dayjs from "dayjs";
import "dayjs/locale/id";
import { api, post } from "@/lib/api-client";
import { useApi } from "@/lib/useApi";
import { PageHeader } from "./PageHeader";

type Key = { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null };
const when = (d: string | null) => (d ? dayjs(d).locale("id").format("D MMM YYYY, HH:mm") : "–");

export function ApiKeys() {
  const keys = useApi<Key[]>("/api/admin/keys");
  const [name, setName] = useState("");
  const [created, setCreated] = useState<{ name: string; key: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await post("/api/admin/keys", { name }) as { name: string; key: string };
      setCreated(r);
      setName("");
      keys.reload();
    } catch (err) {
      notifications.show({ color: "red", message: (err as Error).message });
    } finally { setBusy(false); }
  };

  const revoke = async (k: Key) => {
    if (!confirm(`Cabut kunci "${k.name}"? Aplikasi yang memakainya langsung tidak bisa mengakses data.`)) return;
    await api(`/api/admin/keys/${k.id}`, { method: "DELETE" });
    notifications.show({ color: "gray", message: `Kunci "${k.name}" dicabut` });
    keys.reload();
  };

  return (
    <>
      <PageHeader icon={IconKey} title="Kunci API" subtitle="Akses baca untuk aplikasi lain, misalnya KIPERMAS" />
      <Card p="lg" mb="lg">
        <form onSubmit={create}>
          <Group align="flex-end">
            <TextInput label="Nama aplikasi" placeholder="mis. KIPERMAS produksi" value={name} onChange={(e) => setName(e.currentTarget.value)} style={{ flex: 1, maxWidth: 380 }} required minLength={2} />
            <Button type="submit" leftSection={<IconPlus size={16} />} loading={busy}>Buat kunci</Button>
          </Group>
        </form>
      </Card>
      <Card p={0}>
        <Table.ScrollContainer minWidth={640}>
          <Table verticalSpacing="sm" horizontalSpacing="lg" highlightOnHover>
            <Table.Thead><Table.Tr><Table.Th>Nama</Table.Th><Table.Th>Kunci</Table.Th><Table.Th>Dibuat</Table.Th><Table.Th>Terakhir dipakai</Table.Th><Table.Th>Status</Table.Th><Table.Th /></Table.Tr></Table.Thead>
            <Table.Tbody>
              {(keys.data ?? []).map((k) => (
                <Table.Tr key={k.id}>
                  <Table.Td fw={600}>{k.name}</Table.Td>
                  <Table.Td><Text ff="monospace" fz={13}>{k.prefix}…</Text></Table.Td>
                  <Table.Td fz={13}>{when(k.createdAt)}</Table.Td>
                  <Table.Td fz={13}>{when(k.lastUsedAt)}</Table.Td>
                  <Table.Td>{k.revokedAt ? <Badge color="gray" variant="light">Dicabut</Badge> : <Badge color="teal" variant="light">Aktif</Badge>}</Table.Td>
                  <Table.Td ta="right">{!k.revokedAt && <Button size="xs" variant="subtle" color="red" onClick={() => revoke(k)}>Cabut</Button>}</Table.Td>
                </Table.Tr>
              ))}
              {keys.data?.length === 0 && <Table.Tr><Table.Td colSpan={6}><Text ta="center" c="dimmed" py="lg" fz={14}>Belum ada kunci.</Text></Table.Td></Table.Tr>}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>

      <Modal opened={!!created} onClose={() => setCreated(null)} title={<Text fw={700}>Kunci untuk {created?.name}</Text>} centered size="lg">
        <Stack>
          <Alert color="yellow" icon={<IconAlertTriangle size={18} />}>Salin sekarang. Kunci ini hanya ditampilkan sekali dan tidak bisa dilihat lagi.</Alert>
          <Group wrap="nowrap" gap="xs">
            <TextInput readOnly value={created?.key ?? ""} ff="monospace" style={{ flex: 1 }} onFocus={(e) => e.currentTarget.select()} />
            <CopyButton value={created?.key ?? ""}>
              {({ copied, copy }) => <Button onClick={copy} color={copied ? "teal" : "violet"} leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />}>{copied ? "Tersalin" : "Salin"}</Button>}
            </CopyButton>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
