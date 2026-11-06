import { createTheme } from "@mantine/core";

export const theme = createTheme({
  primaryColor: "violet",
  primaryShade: { light: 6, dark: 5 },
  fontFamily: "var(--font-inter), system-ui, sans-serif",
  headings: { fontFamily: "var(--font-inter), system-ui, sans-serif", fontWeight: "800" },
  defaultRadius: "md",
  components: {
    Card: { defaultProps: { withBorder: true, radius: "lg" } },
    Button: { defaultProps: { radius: "md" } },
  },
});
