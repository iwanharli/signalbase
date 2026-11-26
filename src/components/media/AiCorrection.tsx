"use client";
// The AI category on a card. When the project lets this account correct it (admins, and clients given the project),
// the chip opens a menu to confirm or change the category; the worker keeps a manual choice.
import { createContext, useContext, useState } from "react";
import { Loader, Menu } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import { NO_CATEGORY } from "@/lib/ai/classifier";
import { post } from "@/lib/api-client";
import type { MediaItem, MediaType } from "@/lib/media/types";
import type { Correction } from "./ItemDetailModal";
import { AiCategoryBadge } from "./itemParts";
import classes from "./item.module.css";

export const AiCorrectionContext = createContext<(Correction & { type: MediaType }) | null>(null);

/** Saves a category for one item; shared by the card menu and the detail panel. */
export async function saveCategory(correction: Correction, type: MediaType, item: MediaItem, value: string) {
  const res = await post(`/api/admin/keys/${correction.keyId}/classifications`, { type, code: item.code, category: value }, "PUT") as { category: string; correctedBy: string; reason: string | null };
  const label = value === NO_CATEGORY ? "Tidak termasuk" : correction.categories.find((c) => c.code === value)?.label ?? value;
  correction.onSaved(item.code, { ...(item.classification ?? {}), category: res.category, label, confidence: null, reason: res.reason, manual: true, correctedBy: res.correctedBy });
  return label;
}

export function CardAiCategory({ item }: { item: MediaItem }) {
  const correction = useContext(AiCorrectionContext);
  const [busy, setBusy] = useState(false);
  if (item.classification === undefined) return null;
  if (!correction) return <AiCategoryBadge item={item} />;
  const current = item.classification?.category ?? null;
  const choose = async (value: string) => {
    setBusy(true);
    try {
      const label = await saveCategory(correction, correction.type, item, value);
      notifications.show({ color: "teal", message: value === current ? "Kategori dikonfirmasi" : `Kategori diubah ke ${label}` });
    } catch (e) {
      notifications.show({ color: "red", message: `Kategori tidak tersimpan: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  };
  const options = [...correction.categories.map((c) => ({ value: c.code, label: c.label })), { value: NO_CATEGORY, label: "Tidak termasuk" }];
  // Clicks inside must not open the detail drawer (the menu is portalled, but React events still bubble here).
  return (
    <div className={classes.aiCorrect} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <Menu position="bottom-start" shadow="md" radius="md" width={260} withinPortal>
        <Menu.Target>
          <button type="button" className={classes.aiCorrectButton} disabled={busy} aria-label="Koreksi kategori AI">
            <AiCategoryBadge item={item} />
            {busy ? <Loader size={11} color="currentColor" /> : <IconChevronDown size={13} aria-hidden />}
          </button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>{item.classification?.manual ? "Kategori (sudah dikoreksi)" : "Benar? Konfirmasi atau koreksi"}</Menu.Label>
          {options.map((o) => (
            <Menu.Item key={o.value} onClick={() => choose(o.value)} rightSection={o.value === current ? <IconCheck size={14} /> : null}
              leftSection={o.value === NO_CATEGORY ? null : <b className={classes.aiCorrectCode}>{o.value}</b>}>
              {o.label}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    </div>
  );
}
