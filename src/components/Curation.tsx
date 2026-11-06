"use client";
import { useMemo, useState } from "react";
import { Alert, Affix, Button, Card, Group, LoadingOverlay, Pagination, Paper, SegmentedControl, Select, SimpleGrid, Skeleton, Stack, Text, TextInput, Transition } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useDebouncedValue } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconInbox, IconMessages, IconSearch, IconWorldWww, IconX } from "@tabler/icons-react";
import "dayjs/locale/id";
import { post } from "@/lib/api-client";
import { useApi } from "@/lib/useApi";
import { moodInfo, TYPE_LABEL } from "@/lib/mood";
import { ItemCard, QueueItem } from "./ItemCard";
import { PageHeader } from "./PageHeader";

type Queue = { items: QueueItem[]; page: number; pages: number; total: number; capped: boolean };
type Options = { sources: string[]; moods: string[] };
type Range = [Date | null, Date | null];

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const STATUS = [{ value: "pending", label: "Antrean" }, { value: "approved", label: "Disetujui" }, { value: "rejected", label: "Ditolak" }];

export function Curation({ type }: { type: "sosial" | "online" }) {
  const social = type === "sosial";
  const [status, setStatus] = useState("pending");
  const [q, setQ] = useState("");
  const [dq] = useDebouncedValue(q, 400);
  const [range, setRange] = useState<Range>(() => [new Date(Date.now() - 7 * 864e5), new Date()]);
  const [source, setSource] = useState<string | null>(null);
  const [mood, setMood] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Label chosen per item before approving (pending items aren't stored yet).
  const [draftMood, setDraftMood] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(false);

  const params = useMemo(() => {
    const p = new URLSearchParams({ status, page: String(page) });
    if (dq) p.set("q", dq);
    if (range[0]) p.set("from", ymd(range[0]));
    if (range[1]) p.set("to", ymd(range[1]));
    if (source) p.set("source", source);
    if (mood) p.set("mood", mood);
    return p.toString();
  }, [status, page, dq, range, source, mood]);
  const [shown, setShown] = useState(params);
  if (params !== shown) { setShown(params); setSelected(new Set()); }

  const queue = useApi<Queue>(`/api/admin/queue/${type}?${params}`);
  const { data: options } = useApi<Options>(`/api/admin/options/${type}`);
  const items = queue.data?.items ?? [];
  const resetPage = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(1); };

  const act = async (codes: string[], next: "approved" | "rejected" | "pending", label?: string | null) => {
    setBusy(true);
    try {
      // Items with a corrected label are sent one by one with their label; the rest in one batch.
      const withMood = codes.filter((c) => c in draftMood);
      const plain = codes.filter((c) => !(c in draftMood));
      if (label !== undefined) await post("/api/admin/review", { type, codes, status: next, mood: label });
      else {
        for (const c of withMood) await post("/api/admin/review", { type, codes: [c], status: next, mood: draftMood[c] });
        if (plain.length) await post("/api/admin/review", { type, codes: plain, status: next });
      }
      notifications.show({ color: next === "approved" ? "teal" : next === "rejected" ? "red" : "gray", message: `${codes.length} item ${next === "approved" ? "disetujui" : next === "rejected" ? "ditolak" : "dikembalikan ke antrean"}` });
      setSelected(new Set());
      setDraftMood((d) => Object.fromEntries(Object.entries(d).filter(([k]) => !codes.includes(k))));
      queue.reload();
    } catch (e) {
      notifications.show({ color: "red", title: "Gagal", message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  // On stored items a label change saves immediately; in the queue it waits for the decision.
  const changeMood = (item: QueueItem, m: string | null) => {
    if (status === "pending") setDraftMood((d) => ({ ...d, [item.code]: m }));
    else act([item.code], status as "approved" | "rejected", m);
  };

  const allSelected = items.length > 0 && items.every((i) => selected.has(i.code));
  return (
    <>
      <PageHeader icon={social ? IconMessages : IconWorldWww} title={`Kurasi ${TYPE_LABEL[type]}`}
        subtitle={social ? "Post media sosial yang menyebut kepolisian, dari bankkomen" : "Berita online yang judulnya menyebut kepolisian, dari bankkomen"}
        right={<SegmentedControl value={status} onChange={resetPage(setStatus)} data={STATUS} />} />

      <Card p="md" mb="lg">
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
          <TextInput label="Cari" placeholder={social ? "Kata dalam isi post…" : "Kata dalam judul…"} leftSection={<IconSearch size={16} />} value={q} onChange={(e) => { setQ(e.currentTarget.value); setPage(1); }} />
          <DatePickerInput label="Tanggal terbit" type="range" locale="id" valueFormat="DD MMM YYYY" clearable value={range} onChange={resetPage((v) => setRange(v as Range))} />
          <Select label={social ? "Platform" : "Sumber"} placeholder="Semua" searchable clearable value={source} onChange={resetPage(setSource)} limit={100}
            data={(options?.sources ?? []).map((v) => ({ value: v, label: v }))} />
          <Select label={social ? "Emosi" : "Sentimen"} placeholder="Semua" searchable clearable value={mood} onChange={resetPage(setMood)}
            data={(options?.moods ?? []).map((v) => ({ value: v, label: moodInfo(v).label }))} />
        </SimpleGrid>
      </Card>

      {queue.error && <Alert color="red" mb="lg" title="Gagal memuat">{queue.error}</Alert>}

      <Group justify="space-between" mb="sm">
        <Text fz={14} c="dimmed">
          {queue.data ? <><b style={{ color: "var(--mantine-color-text)" }}>{queue.data.total.toLocaleString("id-ID")}{queue.data.capped ? "+" : ""}</b> item {status === "pending" ? "menunggu ditinjau" : STATUS.find((s) => s.value === status)!.label.toLowerCase()}</> : " "}
        </Text>
        {items.length > 0 && <Button variant="subtle" size="xs" onClick={() => setSelected(allSelected ? new Set() : new Set(items.map((i) => i.code)))}>{allSelected ? "Batal pilih" : "Pilih semua di halaman ini"}</Button>}
      </Group>

      <div style={{ position: "relative" }}>
        <LoadingOverlay visible={queue.loading && !!queue.data} zIndex={5} overlayProps={{ blur: 1, backgroundOpacity: 0.4 }} />
        {!queue.data && !queue.error ? (
          <Stack>{[0, 1, 2].map((i) => <Skeleton key={i} h={170} radius="lg" />)}</Stack>
        ) : items.length === 0 ? (
          <Paper p={48} radius="lg" withBorder ta="center">
            <IconInbox size={40} color="var(--mantine-color-gray-5)" />
            <Text fw={700} mt="sm">{status === "pending" ? "Antrean kosong" : "Belum ada data"}</Text>
            <Text fz={14} c="dimmed">{status === "pending" ? "Semua item pada filter ini sudah ditinjau. Ubah rentang tanggal untuk melihat yang lain." : "Ubah filter atau tinjau item dari antrean."}</Text>
          </Paper>
        ) : (
          <Stack gap="sm">
            {items.map((item) => {
              const shownItem = item.code in draftMood ? { ...item, mood: draftMood[item.code], moodSource: item.mood } : item;
              return (
                <ItemCard key={item.code} item={shownItem} status={status} busy={busy} moods={options?.moods ?? []}
                  selected={selected.has(item.code)} onSelect={(v) => setSelected((s) => { const n = new Set(s); if (v) n.add(item.code); else n.delete(item.code); return n; })}
                  onMood={(m) => changeMood(item, m)} onAct={(s) => act([item.code], s)} />
              );
            })}
          </Stack>
        )}
      </div>

      {queue.data && queue.data.pages > 1 && <Group justify="center" mt="lg"><Pagination value={page} onChange={setPage} total={queue.data.pages} /></Group>}

      <Affix position={{ bottom: 24, left: 0, right: 0 }} zIndex={150}>
        <Transition mounted={selected.size > 0} transition="slide-up">
          {(style) => (
            <Group justify="center" style={style}>
              <Paper shadow="xl" radius="xl" px="lg" py="sm" withBorder>
                <Group gap="sm">
                  <Text fz={14} fw={700}>{selected.size} dipilih</Text>
                  {status !== "rejected" && <Button size="sm" color="red" variant="light" leftSection={<IconX size={16} />} loading={busy} onClick={() => act([...selected], "rejected")}>Tolak</Button>}
                  {status !== "approved" && <Button size="sm" color="teal" leftSection={<IconCheck size={16} />} loading={busy} onClick={() => act([...selected], "approved")}>Setujui</Button>}
                </Group>
              </Paper>
            </Group>
          )}
        </Transition>
      </Affix>
    </>
  );
}
