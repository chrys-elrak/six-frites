"use client";

import {
  type ChatTheme,
  CHAT_THEMES,
  DOODLES,
  type DoodleNode,
  WALLPAPER_LAYOUT,
  WALLPAPER_TILE,
  CUSTOM_THEME_COLORS,
  chatTheme,
  customTheme,
  customThemeColor,
  customThemeColors,
  customThemeId,
  themeName,
  type Wallpaper as WallpaperColors,
} from "@six/shared";
import { Check } from "lucide-react";
import { memo, useEffect, useState } from "react";
import { useChatTheme, useChatThemeStore } from "@/lib/chat-themes";
import { useT } from "@/lib/i18n";
import { Portal } from "./portal";
import { Card, PrimaryButton, SectionTitle } from "./ui";

function Doodle({ nodes }: { nodes: DoodleNode[] }) {
  return (
    <>
      {nodes.map((n, i) =>
        n[0] === "path" ? (
          <path key={i} d={n[1].d} />
        ) : n[0] === "circle" ? (
          <circle key={i} cx={n[1].cx} cy={n[1].cy} r={n[1].r} />
        ) : (
          <rect key={i} x={n[1].x} y={n[1].y} width={n[1].width} height={n[1].height} rx={n[1].rx} />
        ),
      )}
    </>
  );
}

function WallpaperSvg({ w, id, className }: { w: WallpaperColors; id: string; className: string }) {
  return (
    <svg className={className} aria-hidden>
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={w.colors[0]} />
          <stop offset="0.5" stopColor={w.colors[1]} />
          <stop offset="1" stopColor={w.colors[2]} />
        </linearGradient>
        {w.inkOpacity > 0 && (
          <pattern id={`${id}-doodles`} width={WALLPAPER_TILE} height={WALLPAPER_TILE} patternUnits="userSpaceOnUse">
            <g
              fill="none"
              stroke={w.ink}
              strokeOpacity={w.inkOpacity}
              strokeWidth={1.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {WALLPAPER_LAYOUT.map(([name, x, y, scale, rotate], i) =>
                DOODLES[name] ? (
                  <g key={i} transform={`translate(${x} ${y}) rotate(${rotate} 12 12) scale(${scale})`}>
                    <Doodle nodes={DOODLES[name]} />
                  </g>
                ) : null,
              )}
            </g>
          </pattern>
        )}
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id}-bg)`} />
      {w.inkOpacity > 0 && <rect width="100%" height="100%" fill={`url(#${id}-doodles)`} />}
    </svg>
  );
}

/** The chat wallpaper: a soft gradient with a tiled pattern of snack-bar doodles, in light and dark. */
export const Wallpaper = memo(function Wallpaper({ theme, id }: { theme: ChatTheme; id: string }) {
  return (
    <>
      <WallpaperSvg w={theme.light} id={`${id}-l`} className="absolute inset-0 size-full dark:hidden" />
      <WallpaperSvg w={theme.dark} id={`${id}-d`} className="absolute inset-0 hidden size-full dark:block" />
    </>
  );
});

/** The wallpaper behind a chat: its shared background if one is set, otherwise your default. */
/** The wallpaper behind a chat: its shared background if one is set, otherwise your default. */
export function ChatBackground({ themeId }: { themeId: string | null }) {
  const fallback = useChatTheme();
  const theme = themeId ? chatTheme(themeId) : fallback;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <Wallpaper theme={theme} id="chat" />
    </div>
  );
}

/**
 * Recolours the bubbles inside `.${scope}`: yours by redefining the brand colour variables that
 * bg-brand / text-brand-ink read, theirs through --bubble-their(-ink), for light and dark.
 */
export function BubbleColors({ themeId, scope }: { themeId: string | null; scope: string }) {
  const fallback = useChatTheme();
  const theme = themeId ? chatTheme(themeId) : fallback;
  const vars = (w: WallpaperColors) =>
    `--color-brand:${w.bubble};--color-brand-ink:${w.bubbleInk};--bubble-their:${w.theirBubble};--bubble-their-ink:${w.theirBubbleInk};`;
  return (
    <style>{`.${scope}{${vars(theme.light)}}@media (prefers-color-scheme: dark){.${scope}{${vars(theme.dark)}}}`}</style>
  );
}

function ThemeSwatch({ theme, on, label, onClick }: { theme: ChatTheme; on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className="flex shrink-0 flex-col items-center gap-1.5"
    >
      <span
        className={`relative block h-28 w-20 overflow-hidden rounded-xl ring-2 transition ${
          on ? "ring-brand" : "ring-stone-200 hover:ring-stone-300 dark:ring-stone-700"
        }`}
      >
        <Wallpaper theme={theme} id={`swatch-${theme.id.replace(/[^a-z0-9]/gi, "")}`} />
        <span
          className="absolute top-5 right-2 h-3.5 w-9 rounded-full dark:hidden"
          style={{ background: theme.light.bubble }}
        />
        <span
          className="absolute top-5 right-2 hidden h-3.5 w-9 rounded-full dark:block"
          style={{ background: theme.dark.bubble }}
        />
        <span
          className="absolute top-11 left-2 h-3.5 w-11 rounded-full dark:hidden"
          style={{ background: theme.light.theirBubble }}
        />
        <span
          className="absolute top-11 left-2 hidden h-3.5 w-11 rounded-full dark:block"
          style={{ background: theme.dark.theirBubble }}
        />
        {on && (
          <span className="absolute right-1.5 bottom-1.5 grid size-5 place-items-center rounded-full bg-brand text-brand-ink">
            <Check className="size-3.5" strokeWidth={3} />
          </span>
        )}
      </span>
      <span className={`text-xs ${on ? "font-semibold text-brand" : "text-stone-600 dark:text-stone-300"}`}>{label}</span>
    </button>
  );
}

const HEX = /^#?([0-9a-f]{6})$/i;

/**
 * Picks your bubble colour and, optionally, the other person's, previewing the whole theme built from
 * them: wallpaper, doodles and both kinds of bubble.
 */
export function CustomThemeDialog({
  title,
  current,
  onPick,
  onClose,
}: {
  title: string;
  current: string | null;
  onPick: (mine: string, theirs: string | null) => void;
  onClose: () => void;
}) {
  const tr = useT();
  const start = customThemeColors(current);
  const [mine, setMine] = useState(start?.mine ?? CUSTOM_THEME_COLORS[0]!);
  const [theirs, setTheirs] = useState<string | null>(start?.theirs ?? null);
  const [target, setTarget] = useState<"mine" | "theirs">("mine");
  const [typed, setTyped] = useState(mine);
  const hex = target === "mine" ? mine : theirs;
  const theme = customTheme(mine, theirs);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const choose = (c: string | null) => {
    const value = c?.toLowerCase() ?? null;
    if (target === "mine") setMine(value ?? mine);
    else setTheirs(value);
    setTyped(value ?? "");
  };
  const switchTo = (next: "mine" | "theirs") => {
    setTarget(next);
    setTyped((next === "mine" ? mine : theirs) ?? "");
  };

  const bubble = (mode: "light" | "dark", who: "mine" | "theirs", text: string) => {
    const w = theme[mode];
    return (
      <span
        className={`rounded-2xl px-3 py-1.5 ${who === "mine" ? "self-end rounded-br-md" : "self-start rounded-bl-md"} ${
          mode === "light" ? "dark:hidden" : "hidden dark:block"
        }`}
        style={
          who === "mine"
            ? { background: w.bubble, color: w.bubbleInk }
            : { background: w.theirBubble, color: w.theirBubbleInk }
        }
      >
        {text}
      </span>
    );
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="dialog" aria-modal aria-label={title}>
        <button type="button" aria-label={tr.common.close} onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
        <div className="relative w-full max-w-sm space-y-4 rounded-t-3xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl md:rounded-3xl md:pb-4 dark:bg-stone-900">
          <h2 className="text-center font-semibold">{title}</h2>

          <div className="relative h-36 overflow-hidden rounded-2xl ring-1 ring-stone-200 dark:ring-stone-800">
            <Wallpaper theme={theme} id="custom-preview" />
            <div className="relative flex h-full flex-col justify-center gap-2 p-3 text-sm">
              {bubble("light", "theirs", tr.settings.previewTheirs)}
              {bubble("dark", "theirs", tr.settings.previewTheirs)}
              {bubble("light", "mine", tr.settings.previewMine)}
              {bubble("dark", "mine", tr.settings.previewMine)}
            </div>
          </div>

          <div role="tablist" className="flex rounded-xl bg-stone-100 p-1 dark:bg-stone-800">
            {(["mine", "theirs"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={target === k}
                onClick={() => switchTo(k)}
                className={`flex-1 rounded-lg py-1.5 text-sm font-semibold transition ${
                  target === k ? "bg-brand text-brand-ink" : "text-stone-600 dark:text-stone-300"
                }`}
              >
                {k === "mine" ? tr.settings.yourMessages : tr.settings.theirMessages}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap justify-center gap-2.5">
            {target === "theirs" && (
              <button
                type="button"
                onClick={() => choose(null)}
                aria-pressed={theirs === null}
                className={`grid size-10 place-items-center rounded-full text-[11px] font-bold text-stone-600 ring-2 dark:text-stone-300 ${
                  theirs === null ? "ring-brand" : "ring-stone-200 dark:ring-stone-700"
                }`}
              >
                {tr.settings.autoColour}
              </button>
            )}
            {CUSTOM_THEME_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => choose(c)}
                aria-label={tr.settings.colour(c)}
                aria-pressed={c === hex}
                className="grid size-10 place-items-center rounded-full transition hover:scale-105"
                style={{ background: c, color: customTheme(c).light.bubbleInk }}
              >
                {c === hex && <Check className="size-4.5" strokeWidth={3} />}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-3 rounded-xl bg-stone-100 px-3 py-2 dark:bg-stone-800">
            <input
              type="color"
              value={hex ?? theme.light.theirBubble}
              onChange={(e) => choose(e.target.value)}
              aria-label={tr.settings.pickAnyColour}
              className="size-7 cursor-pointer rounded-full border-0 bg-transparent p-0"
            />
            <input
              value={typed}
              placeholder={target === "theirs" ? tr.settings.autoColour : "#eb8a00"}
              onChange={(e) => {
                setTyped(e.target.value);
                const m = HEX.exec(e.target.value.trim());
                if (!m) return;
                const c = `#${m[1]!.toLowerCase()}`;
                if (target === "mine") setMine(c);
                else setTheirs(c);
              }}
              maxLength={7}
              spellCheck={false}
              aria-label={tr.settings.colourCode}
              className="min-w-0 flex-1 bg-transparent font-mono text-[16px] outline-none md:text-sm"
            />
          </label>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-stone-100 dark:hover:bg-stone-800"
            >
              {tr.common.cancel}
            </button>
            <PrimaryButton
              className="flex-1"
              onClick={() => {
                onPick(mine, theirs);
                onClose();
              }}
            >
              {tr.settings.useColours}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </Portal>
  );
}

export function ChatBackgroundPicker() {
  const tr = useT();
  const current = useChatThemeStore((s) => s.id);
  const choose = useChatThemeStore((s) => s.set);
  const [custom, setCustom] = useState(false);
  const customHex = customThemeColor(current);
  return (
    <section className="space-y-3">
      <SectionTitle>{tr.settings.defaultBackground}</SectionTitle>
      <Card className="p-2">
        <div role="radiogroup" aria-label={tr.settings.defaultBackground} className="flex gap-3 overflow-x-auto p-1 pb-2">
          {CHAT_THEMES.map((theme) => (
            <ThemeSwatch
              key={theme.id}
              theme={theme}
              on={theme.id === current}
              label={themeName(theme.id, tr)}
              onClick={() => choose(theme.id)}
            />
          ))}
          <ThemeSwatch
            theme={customTheme(customHex ?? CUSTOM_THEME_COLORS[3]!)}
            on={!!customHex}
            label={tr.common.custom}
            onClick={() => setCustom(true)}
          />
        </div>
      </Card>
      {custom && (
        <CustomThemeDialog
          title={tr.settings.defaultCustomBackground}
          current={current}
          onPick={(mine, theirs) => choose(customThemeId(mine, theirs))}
          onClose={() => setCustom(false)}
        />
      )}
    </section>
  );
}
