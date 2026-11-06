"use client";
import { useState } from "react";
import { Alert, Button, Paper, PasswordInput, Stack, Text, TextInput, Title } from "@mantine/core";
import { IconLock, IconUser } from "@tabler/icons-react";
import { Logo } from "@/components/Logo";
import classes from "./login.module.css";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
    if (res.ok) return void (window.location.href = "/");
    setError((await res.json().catch(() => ({}))).error ?? "Gagal masuk");
    setBusy(false);
  };

  return (
    <div className={classes.page}>
      <div className={classes.glow} />
      <Paper component="form" onSubmit={submit} className={classes.card} p={36} radius="xl">
        <Stack gap="lg">
          <Logo />
          <div>
            <Title order={2} fz={24}>Masuk ke panel Signalbase</Title>
            <Text c="dimmed" fz={14} mt={4}>Saring data media sebelum diteruskan ke aplikasi lain.</Text>
          </div>
          {error && <Alert color="red" variant="light">{error}</Alert>}
          <TextInput label="Username" leftSection={<IconUser size={16} />} value={username} onChange={(e) => setUsername(e.currentTarget.value)} autoComplete="username" required />
          <PasswordInput label="Kata sandi" leftSection={<IconLock size={16} />} value={password} onChange={(e) => setPassword(e.currentTarget.value)} autoComplete="current-password" required />
          <Button type="submit" size="md" loading={busy} variant="gradient" gradient={{ from: "violet.7", to: "cyan.6", deg: 120 }}>Masuk</Button>
        </Stack>
      </Paper>
    </div>
  );
}
