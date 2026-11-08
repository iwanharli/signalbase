"use client";
import { useState } from "react";
import Link from "next/link";
import { Alert, Anchor, Button, Paper, PasswordInput, Stack, Text, TextInput, Title } from "@mantine/core";
import { IconId, IconLock, IconUser } from "@tabler/icons-react";
import { Logo } from "@/components/Logo";
import classes from "./login.module.css";

/** Shared sign-in / sign-up card. Both end signed in and go to the page for the account's role. */
export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const register = mode === "register";
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  // Plan picked on /pricing (?plan=pro); recorded for the admin, the account still starts with the trial.
  const requestedPlan = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("plan") ?? undefined : undefined;
  const inactive = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("inactive");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(register ? { name, username, password, plan: requestedPlan } : { username, password }) });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.pending) { setPending(true); setBusy(false); return; }
    if (res.ok) return void (window.location.href = body.home ?? "/");
    setError(body.error ?? (register ? "Gagal mendaftar" : "Gagal masuk"));
    setBusy(false);
  };

  return (
    <div className={classes.page}>
      <div className={classes.glow} />
      <Paper component="form" onSubmit={submit} className={classes.card} p={36} radius="xl">
        <Stack gap="lg">
          <Link href="/" aria-label="Beranda Signalbase" style={{ color: "inherit", textDecoration: "none", alignSelf: "flex-start" }}><Logo /></Link>
          <div>
            <Title order={2} fz={24}>{register ? "Buat akun Signalbase" : "Masuk ke Signalbase"}</Title>
            <Text c="dimmed" fz={14} mt={4}>{register ? "Setelah disetujui admin, atur keyword Anda dan buat proyek, dan ambil data media lewat kunci API." : "Saring data media sebelum diteruskan ke aplikasi lain."}</Text>
          </div>
          {pending ? (
            <Alert color="teal" variant="light" title="Pendaftaran terkirim">
              Akun <b>{username}</b> menunggu persetujuan admin. Anda bisa masuk setelah akun disetujui; trial dimulai saat itu.
            </Alert>
          ) : <>
          {inactive && !error && <Alert color="yellow" variant="light">Akun Anda belum aktif atau sudah dinonaktifkan. Hubungi admin.</Alert>}
          {error && <Alert color="red" variant="light">{error}</Alert>}
          {register && <TextInput label="Nama" leftSection={<IconId size={16} />} value={name} onChange={(e) => setName(e.currentTarget.value)} autoComplete="name" required />}
          <TextInput label="Username" leftSection={<IconUser size={16} />} value={username} onChange={(e) => setUsername(e.currentTarget.value)} autoComplete="username" required
            description={register ? "Huruf kecil, angka, titik, atau garis bawah" : undefined} />
          <PasswordInput label="Kata sandi" leftSection={<IconLock size={16} />} value={password} onChange={(e) => setPassword(e.currentTarget.value)}
            autoComplete={register ? "new-password" : "current-password"} description={register ? "Minimal 8 karakter" : undefined} required />
          {register && <Text fz={12.5} c="dimmed">Dengan mendaftar, Anda menyetujui <Anchor component={Link} href="/syarat" fz={12.5}>Syarat & Ketentuan</Anchor> dan <Anchor component={Link} href="/privasi" fz={12.5}>Kebijakan Privasi</Anchor>.</Text>}
          <Button type="submit" size="md" loading={busy} variant="gradient" gradient={{ from: "violet.7", to: "cyan.6", deg: 120 }}>{register ? "Daftar" : "Masuk"}</Button>
          </>}
          <Text fz={14} ta="center" c="dimmed">
            {register ? "Sudah punya akun? " : "Belum punya akun? "}
            <Anchor component={Link} href={register ? "/login" : "/register"} fw={600}>{register ? "Masuk" : "Daftar"}</Anchor>
          </Text>
        </Stack>
      </Paper>
    </div>
  );
}
