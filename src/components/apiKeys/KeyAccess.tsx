"use client";
// Keamanan tab: restrict where the project's key may be used from — server IPs and/or website domains.
// Saved on its own (not through the page's save bar) because it doesn't touch the data scope or AI labels.
import { useEffect, useState } from "react";
import { TagsInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconDeviceFloppy, IconWorld, IconServer } from "@tabler/icons-react";
import { MAX_ACCESS_RULES, normalizeIpRule, normalizeOriginRule } from "@/lib/keyAccess";
import { post } from "@/lib/api-client";
import { Button } from "../ui/Button";
import { keyInputClasses } from "./ScopeFields";
import classes from "./apiKeys.module.css";

export type KeyAccessRules = { ips: string[]; origins: string[] };

const same = (a: string[], b: string[]) => JSON.stringify(a) === JSON.stringify(b);

/** Keeps the entered value when it is valid (in canonical form), drops it with a message when it is not. */
function cleaned(values: string[], normalize: (raw: string) => string | null, what: string) {
  const out: string[] = [];
  for (const raw of values) {
    const rule = normalize(raw);
    if (!rule) { notifications.show({ color: "red", message: `${what} tidak valid: ${raw}` }); continue; }
    if (!out.includes(rule)) out.push(rule);
  }
  return out;
}

export function KeyAccess({ keyId, saved, onSaved }: { keyId: string; saved: KeyAccessRules; onSaved: () => void }) {
  const [ips, setIps] = useState(saved.ips);
  const [origins, setOrigins] = useState(saved.origins);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setIps(saved.ips); setOrigins(saved.origins); }, [saved]);
  const dirty = !same(ips, saved.ips) || !same(origins, saved.origins);
  const open = !ips.length && !origins.length;

  const save = async () => {
    setBusy(true);
    try {
      await post(`/api/admin/keys/${keyId}/access`, { ips, origins }, "PUT");
      notifications.show({ color: "teal", message: ips.length || origins.length ? "Pembatasan akses disimpan" : "Kunci bisa dipakai dari mana saja" });
      onSaved();
    } catch (err) {
      notifications.show({ color: "red", message: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={classes.accessBox}>
      <div className={classes.accessHead}>
        <div>
          <b>Batasi asal pemakaian</b>
          <p>
            {open
              ? "Saat ini kunci bisa dipakai dari server atau situs mana pun. Isi salah satu daftar agar kunci yang bocor tidak bisa dipakai di tempat lain."
              : "Panggilan dari luar daftar ditolak dengan status 403. Panggilan diterima bila berasal dari salah satu IP atau salah satu situs di bawah."}
          </p>
        </div>
        <span className={classes.accessState} data-open={open || undefined}>{open ? "Tanpa batasan" : "Dibatasi"}</span>
      </div>

      <div className={classes.accessFields}>
        <TagsInput classNames={keyInputClasses} leftSection={<IconServer size={16} />} label="Alamat IP server"
          description="Untuk aplikasi yang memanggil API dari server (backend). Contoh: 203.0.113.7 atau rentang 203.0.113.0/24."
          placeholder={ips.length ? "" : "203.0.113.7"} value={ips} maxTags={MAX_ACCESS_RULES} splitChars={[",", " ", "\n"]} clearable
          onChange={(v) => setIps(cleaned(v, normalizeIpRule, "Alamat IP"))} />
        <TagsInput classNames={keyInputClasses} leftSection={<IconWorld size={16} />} label="Domain situs"
          description="Untuk halaman web yang memanggil API langsung dari browser. Contoh: kipermas.id, atau *.kipermas.id untuk semua subdomain."
          placeholder={origins.length ? "" : "app.kipermas.id"} value={origins} maxTags={MAX_ACCESS_RULES} splitChars={[",", " ", "\n"]} clearable
          onChange={(v) => setOrigins(cleaned(v, normalizeOriginRule, "Domain"))} />
      </div>

      {origins.length > 0 && !ips.length && (
        <div className={classes.accessWarn} role="alert">
          <b>Aplikasi yang memanggil API dari server akan ditolak.</b>
          <span>
            Domain hanya dikenali bila browser memanggil API langsung. Jika aplikasi Anda (mis. Next.js, Laravel, atau backend lain) memanggil
            Signalbase dari servernya, permintaan itu tidak membawa domain; tambahkan alamat IP server tersebut, termasuk IPv6 bila server memakainya.
          </span>
        </div>
      )}

      <p className={classes.accessNote}>
        Domain dicek dari header Origin yang dikirim browser, jadi melindungi dari pemakaian di situs lain, bukan dari skrip server yang meniru header.
        Untuk kunci yang dipakai server, gunakan daftar IP.
      </p>

      <div className={classes.accessActions}>
        {dirty && <Button onDark variant="secondary" disabled={busy} onClick={() => { setIps(saved.ips); setOrigins(saved.origins); }}>Batalkan</Button>}
        <Button variant="primary" icon={IconDeviceFloppy} disabled={!dirty} loading={busy} onClick={save}>Simpan pembatasan</Button>
      </div>
    </div>
  );
}
