import { useColorScheme } from "react-native";

export const stone = {
  50: "#fafaf9",
  100: "#f5f5f4",
  200: "#e7e5e4",
  300: "#d6d3d1",
  400: "#a8a29e",
  500: "#78716c",
  600: "#57534e",
  700: "#44403c",
  800: "#292524",
  900: "#1c1917",
  950: "#0c0a09",
};

export const brand = "#eb8a00";
export const brandInk = "#3e2104";
export const flame = "#f97316";

const light = {
  dark: false,
  bg: stone[50],
  surface: "#ffffff",
  surfaceAlt: stone[100],
  field: stone[100],
  border: stone[200],
  ring: stone[200],
  text: stone[900],
  textSoft: stone[600],
  muted: stone[500],
  faint: stone[400],
  pressed: stone[100],
  chip: "rgba(231,229,228,0.8)",
  bubbleIn: "#ffffff",
  danger: "#dc2626",
  dangerBg: "#fef2f2",
  dangerText: "#b91c1c",
  success: "#065f46",
  successBg: "#d1fae5",
  read: "#0369a1",
  inverse: stone[900],
  onInverse: "#ffffff",
  backdrop: "rgba(0,0,0,0.4)",
};

const dark: typeof light = {
  dark: true,
  bg: stone[950],
  surface: stone[900],
  surfaceAlt: stone[800],
  field: stone[800],
  border: stone[800],
  ring: stone[700],
  text: stone[100],
  textSoft: stone[300],
  muted: stone[400],
  faint: stone[500],
  pressed: stone[800],
  chip: stone[800],
  bubbleIn: stone[800],
  danger: "#f87171",
  dangerBg: "#450a0a",
  dangerText: "#fca5a5",
  success: "#6ee7b7",
  successBg: "#022c22",
  read: "#7dd3fc",
  inverse: stone[100],
  onInverse: stone[900],
  backdrop: "rgba(0,0,0,0.55)",
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === "dark" ? dark : light;
}
