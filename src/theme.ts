import { createTheme } from "@mantine/core";

export const theme = createTheme({
  primaryColor: "violet",
  primaryShade: { light: 6, dark: 5 },
  // Dark mode: cool blue-grey ink. 0 text · 2 dimmed · 4 border · 5 hover · 6 card/input · 7 body.
  colors: {
    dark: ["#e4e7f0", "#b9bed0", "#8c92a8", "#5f6580", "#2f3349", "#252940", "#1a1d2f", "#12141f", "#0d0f18", "#08090f"],
  },
  fontFamily: "var(--font-inter), system-ui, sans-serif",
  headings: { fontFamily: "var(--font-inter), system-ui, sans-serif", fontWeight: "800" },
  defaultRadius: "md",
  components: {
    Card: { defaultProps: { withBorder: true, radius: "lg" } },
    Button: { defaultProps: { radius: "md" } },
  },
});
