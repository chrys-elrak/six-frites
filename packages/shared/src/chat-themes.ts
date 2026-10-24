/** One SVG primitive of a doodle, drawn as an outline on a 24×24 grid. */
export type DoodleNode =
  | ["path", { d: string }]
  | ["circle", { cx: number; cy: number; r: number }]
  | ["rect", { x: number; y: number; width: number; height: number; rx?: number }];

/** Snack-bar doodles that make up the chat wallpaper pattern. Drawn for Six Frites. */
export const DOODLES: Record<string, DoodleNode[]> = {
  fries: [
    ["path", { d: "M5.5 11h13l-1.6 10.2a1 1 0 0 1-1 .8H8.1a1 1 0 0 1-1-.8z" }],
    ["path", { d: "M8 11V4.5M10.6 11V3M13.4 11V3.5M16 11V5" }],
    ["path", { d: "M9.5 15.5c1.4 1.2 3.6 1.2 5 0" }],
  ],
  fry: [["rect", { x: 10.5, y: 3, width: 3, height: 18, rx: 1.5 }]],
  burger: [
    ["path", { d: "M4 11a8 6 0 0 1 16 0z" }],
    ["path", { d: "M9 7.6l.7.3M12.6 6.8l.7-.2M15 8.6l.6.4" }],
    ["path", { d: "M3.5 14.2c1.4-.9 2.6.9 4 0s2.6.9 4 0 2.6.9 4 0 2.6.9 4 0" }],
    ["path", { d: "M5 17h14v1a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" }],
  ],
  ketchup: [
    [
      "path",
      {
        d: "M10 2.5h4V5l2.2 3.2a2 2 0 0 1 .3 1.1V20a1.5 1.5 0 0 1-1.5 1.5H9A1.5 1.5 0 0 1 7.5 20V9.3a2 2 0 0 1 .3-1.1L10 5z",
      },
    ],
    ["path", { d: "M8 12.5h8M8 16.5h8" }],
  ],
  soda: [
    ["path", { d: "M7 8.5h10l-1.3 12a1 1 0 0 1-1 .9H9.3a1 1 0 0 1-1-.9z" }],
    ["path", { d: "M6 8.5h12M13 8.5l1.5-6H17M7.6 13h8.8" }],
  ],
  sauce: [
    ["path", { d: "M12 3.5c2.8 3.6 5 6.7 5 9.5a5 5 0 0 1-10 0c0-2.8 2.2-5.9 5-9.5z" }],
    ["path", { d: "M10 14a2 2 0 0 0 1.5 2" }],
  ],
  salt: [
    ["path", { d: "M8 10h8v9.5a2.5 2.5 0 0 1-2.5 2.5h-3A2.5 2.5 0 0 1 8 19.5z" }],
    ["path", { d: "M8.5 10c0-3.2 1.6-5.5 3.5-5.5s3.5 2.3 3.5 5.5" }],
    ["circle", { cx: 10.8, cy: 7.4, r: 0.5 }],
    ["circle", { cx: 13.2, cy: 7.4, r: 0.5 }],
    ["circle", { cx: 12, cy: 6, r: 0.5 }],
  ],
  potato: [
    ["path", { d: "M6.5 8.5c2-4 9-4.5 11.5-.5s1 10-3.5 11.5-10.5-.5-10-5.5c.2-2 .9-3.6 2-5.5z" }],
    ["circle", { cx: 10, cy: 10, r: 0.5 }],
    ["circle", { cx: 14, cy: 13, r: 0.5 }],
    ["circle", { cx: 10.8, cy: 15.6, r: 0.5 }],
  ],
  ring: [
    ["circle", { cx: 12, cy: 12, r: 7 }],
    ["circle", { cx: 12, cy: 12, r: 3.5 }],
  ],
  heart: [["path", { d: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" }]],
  bubble: [
    ["path", { d: "M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4 3.5V16H6a2 2 0 0 1-2-2z" }],
  ],
  sparkle: [["path", { d: "M12 4v4M12 16v4M4 12h4M16 12h4M7 7l1.8 1.8M15.2 15.2 17 17M17 7l-1.8 1.8M8.8 15.2 7 17" }]],
};

/** Size of one pattern tile, in px. */
export const WALLPAPER_TILE = 300;

/** Where each doodle sits in a tile: doodle, x, y, scale, rotation in degrees. Placed by hand to look scattered. */
export const WALLPAPER_LAYOUT: [string, number, number, number, number][] = [
  ["fries", 10, 8, 1.8, -10],
  ["ketchup", 92, 2, 1.6, 14],
  ["bubble", 168, 14, 1.6, -6],
  ["sparkle", 246, 18, 1.1, 0],
  ["fry", 252, 78, 1.4, 28],
  ["burger", 126, 82, 1.8, -8],
  ["fry", 56, 78, 1.4, 32],
  ["sauce", 6, 138, 1.4, -14],
  ["soda", 76, 140, 1.7, 8],
  ["salt", 196, 136, 1.6, -16],
  ["heart", 252, 200, 1.3, 12],
  ["potato", 150, 206, 1.6, 20],
  ["ring", 52, 214, 1.5, 0],
  ["fry", 4, 254, 1.3, -38],
  ["fries", 206, 240, 1.4, 6],
  ["sauce", 110, 262, 1.1, 18],
];

export interface Wallpaper {
  /** Gradient stops, top-left to bottom-right. */
  colors: [string, string, string];
  /** Colour and opacity of the doodle outlines; opacity 0 shows no pattern. */
  ink: string;
  inkOpacity: number;
  /** Your own message bubbles: background and the text drawn on it. */
  bubble: string;
  bubbleInk: string;
  /** The other person's message bubbles. */
  theirBubble: string;
  theirBubbleInk: string;
}

export interface ChatTheme {
  id: string;
  name: string;
  light: Wallpaper;
  dark: Wallpaper;
}

export const CHAT_THEMES: ChatTheme[] = [
  {
    id: "frites",
    name: "Frites",
    light: {
      colors: ["#fff6e0", "#ffe2a8", "#ffc977"],
      ink: "#b8620b",
      inkOpacity: 0.17,
      bubble: "#eb8a00",
      bubbleInk: "#3e2104",
      theirBubble: "#fffaf0",
      theirBubbleInk: "#3b2a14",
    },
    dark: {
      colors: ["#2b1d0e", "#22170b", "#170f07"],
      ink: "#f5a524",
      inkOpacity: 0.11,
      bubble: "#eb8a00",
      bubbleInk: "#3e2104",
      theirBubble: "#2e2216",
      theirBubbleInk: "#f6ead8",
    },
  },
  {
    id: "ketchup",
    name: "Ketchup",
    light: {
      colors: ["#ffece7", "#ffd2c7", "#f9ae9e"],
      ink: "#a4231a",
      inkOpacity: 0.14,
      bubble: "#d93a2f",
      bubbleInk: "#ffffff",
      theirBubble: "#fff6f4",
      theirBubbleInk: "#3a1512",
    },
    dark: {
      colors: ["#2a1210", "#200d0c", "#160908"],
      ink: "#f87171",
      inkOpacity: 0.1,
      bubble: "#c2332a",
      bubbleInk: "#ffffff",
      theirBubble: "#2e1916",
      theirBubbleInk: "#f9e3df",
    },
  },
  {
    id: "mayo",
    name: "Mayo",
    light: {
      colors: ["#fffdf3", "#fff6d8", "#fbecb8"],
      ink: "#8a6d1c",
      inkOpacity: 0.14,
      bubble: "#f5d76e",
      bubbleInk: "#3f310a",
      theirBubble: "#fffef8",
      theirBubbleInk: "#3a3114",
    },
    dark: {
      colors: ["#262318", "#1e1b12", "#15130c"],
      ink: "#e9d58f",
      inkOpacity: 0.1,
      bubble: "#e8c75a",
      bubbleInk: "#2e2406",
      theirBubble: "#2b281d",
      theirBubbleInk: "#f3ecd4",
    },
  },
  {
    id: "pickle",
    name: "Pickle",
    light: {
      colors: ["#f0f7df", "#dcedbb", "#bfdc95"],
      ink: "#4d6b1f",
      inkOpacity: 0.15,
      bubble: "#a9d26a",
      bubbleInk: "#1f2e08",
      theirBubble: "#f9fdf1",
      theirBubbleInk: "#24300f",
    },
    dark: {
      colors: ["#1a2312", "#141c0e", "#0e1409"],
      ink: "#a3c86b",
      inkOpacity: 0.1,
      bubble: "#8dbb4c",
      bubbleInk: "#15200a",
      theirBubble: "#1f2a17",
      theirBubbleInk: "#e6f1d4",
    },
  },
  {
    id: "soda",
    name: "Soda",
    light: {
      colors: ["#e6f2fb", "#c9e2f6", "#a9cff0"],
      ink: "#1f5f8b",
      inkOpacity: 0.14,
      bubble: "#2b78c2",
      bubbleInk: "#ffffff",
      theirBubble: "#f5faff",
      theirBubbleInk: "#12324d",
    },
    dark: {
      colors: ["#0f1b26", "#0c1620", "#081017"],
      ink: "#7cb8e6",
      inkOpacity: 0.1,
      bubble: "#2a6fb3",
      bubbleInk: "#ffffff",
      theirBubble: "#17222e",
      theirBubbleInk: "#dcebf8",
    },
  },
  {
    id: "plain",
    name: "Plain",
    light: {
      colors: ["#fafaf9", "#fafaf9", "#fafaf9"],
      ink: "#000000",
      inkOpacity: 0,
      bubble: "#eb8a00",
      bubbleInk: "#3e2104",
      theirBubble: "#ffffff",
      theirBubbleInk: "#1c1917",
    },
    dark: {
      colors: ["#0c0a09", "#0c0a09", "#0c0a09"],
      ink: "#000000",
      inkOpacity: 0,
      bubble: "#eb8a00",
      bubbleInk: "#3e2104",
      theirBubble: "#292524",
      theirBubbleInk: "#f5f5f4",
    },
  },
];

export const DEFAULT_CHAT_THEME = "frites";

/** Colours offered for a custom theme. Any #rrggbb works; these are just quick picks. */
export const CUSTOM_THEME_COLORS = [
  "#eb8a00",
  "#d93a2f",
  "#e0457b",
  "#a855f7",
  "#6366f1",
  "#2b78c2",
  "#0ea5a4",
  "#16a34a",
  "#84cc16",
  "#eab308",
  "#a16207",
  "#57534e",
];

const CUSTOM = /^custom:(#[0-9a-f]{6})(?::(#[0-9a-f]{6}))?$/;

/** A custom theme id: your bubble colour, plus the other person's when it isn't left automatic. */
export const customThemeId = (mine: string, theirs?: string | null) =>
  `custom:${mine.toLowerCase()}${theirs ? `:${theirs.toLowerCase()}` : ""}`;

export function customThemeColors(id: string | null | undefined) {
  const m = id ? CUSTOM.exec(id) : null;
  return m ? { mine: m[1]!, theirs: m[2] ?? null } : null;
}

export const customThemeColor = (id: string | null | undefined) => customThemeColors(id)?.mine ?? null;

/** Whether an id names a built-in theme or a custom one ("custom:#rrggbb" or "custom:#rrggbb:#rrggbb"). */
export const isChatThemeId = (id: string) => CUSTOM.test(id) || CHAT_THEMES.some((t) => t.id === id);

function toHsl(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function hsl(h: number, s: number, l: number) {
  const k = (n: number) => (n + h / 30) % 12;
  const a = Math.min(Math.max(s, 0), 1) * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (x: number) =>
    Math.round(Math.min(Math.max(x, 0), 1) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
}

function luminance(hex: string) {
  const lin = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(1) + 0.7152 * lin(3) + 0.0722 * lin(5);
}

/** Dark text on light bubbles and white on dark ones, whichever reads better. */
function inkFor(bubble: string, h: number, s: number) {
  const dark = hsl(h, Math.min(s, 0.6), 0.14);
  const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const L = luminance(bubble);
  return contrast(L, 1) >= contrast(L, luminance(dark)) ? "#ffffff" : dark;
}

/**
 * Builds a whole theme (wallpaper, doodles and both kinds of bubble, light and dark) from your bubble
 * colour, and optionally the other person's; otherwise theirs is a soft tint of yours.
 */
export function customTheme(mine: string, theirs?: string | null): ChatTheme {
  const [h, s, l] = toHsl(mine);
  const darkBubble = hsl(h, s, Math.min(l, 0.5) * 0.9);
  let their: { light: [string, string]; dark: [string, string] };
  if (theirs) {
    const [th, ts, tl] = toHsl(theirs);
    const dark = hsl(th, ts, Math.min(tl, 0.5) * 0.9);
    their = { light: [theirs, inkFor(theirs, th, ts)], dark: [dark, inkFor(dark, th, ts)] };
  } else {
    their = {
      light: [hsl(h, s * 0.5, 0.98), hsl(h, Math.min(s, 0.5), 0.14)],
      dark: [hsl(h, s * 0.25, 0.16), hsl(h, s * 0.2, 0.93)],
    };
  }
  return {
    id: customThemeId(mine, theirs),
    name: "Custom",
    light: {
      colors: [hsl(h, s * 0.9, 0.95), hsl(h, s * 0.8, 0.88), hsl(h, s * 0.75, 0.8)],
      ink: hsl(h, s, 0.3),
      inkOpacity: 0.15,
      bubble: mine,
      bubbleInk: inkFor(mine, h, s),
      theirBubble: their.light[0],
      theirBubbleInk: their.light[1],
    },
    dark: {
      colors: [hsl(h, s * 0.35, 0.1), hsl(h, s * 0.35, 0.08), hsl(h, s * 0.35, 0.06)],
      ink: hsl(h, s * 0.8, 0.65),
      inkOpacity: 0.1,
      bubble: darkBubble,
      bubbleInk: inkFor(darkBubble, h, s),
      theirBubble: their.dark[0],
      theirBubbleInk: their.dark[1],
    },
  };
}

export function chatTheme(id: string | null | undefined): ChatTheme {
  const custom = customThemeColors(id);
  if (custom) return customTheme(custom.mine, custom.theirs);
  return CHAT_THEMES.find((t) => t.id === id) ?? CHAT_THEMES.find((t) => t.id === DEFAULT_CHAT_THEME)!;
}
