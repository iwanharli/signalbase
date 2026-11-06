import { Group, Text, ThemeIcon, Title } from "@mantine/core";
import type { Icon } from "@tabler/icons-react";

export function PageHeader({ icon: I, title, subtitle, right }: { icon: Icon; title: string; subtitle: string; right?: React.ReactNode }) {
  return (
    <Group justify="space-between" align="flex-start" mb="xl" gap="md">
      <Group gap="md" wrap="nowrap">
        <ThemeIcon size={46} radius="md" variant="gradient" gradient={{ from: "violet.7", to: "cyan.6", deg: 135 }}><I size={24} /></ThemeIcon>
        <div>
          <Title order={2} fz={{ base: 22, sm: 26 }}>{title}</Title>
          <Text c="dimmed" fz={14}>{subtitle}</Text>
        </div>
      </Group>
      {right}
    </Group>
  );
}
