"use client";

import {
  type EntityType,
  LABEL_FONTS,
  MESSAGE_TEXT_SIZES,
  TEXT_COLORS,
  TEXT_FONTS,
  TEXT_GRADIENTS,
  type TextColor,
  type TextGradient,
  hslHex,
} from "@six/shared";
import { ALargeSmall, Bold, Code, EyeOff, Highlighter, Italic, type LucideIcon, Palette, Plus, Strikethrough, Type, TypeOutline, Underline } from "lucide-react";
import { useRef, useState } from "react";
import { useT } from "@/lib/i18n";

const formats: { type: EntityType; keys: string; Icon: LucideIcon }[] = [
  { type: "bold", keys: "B", Icon: Bold },
  { type: "italic", keys: "I", Icon: Italic },
  { type: "underline", keys: "U", Icon: Underline },
  { type: "strike", keys: "Shift+X", Icon: Strikethrough },
  { type: "code", keys: "E", Icon: Code },
  { type: "spoiler", keys: "Shift+P", Icon: EyeOff },
];

const modifierKey = () => (/Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl+");

export const keepSelection = (onPress: () => void) => ({
  onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
  onTouchStart: (e: React.TouchEvent) => e.preventDefault(),
  onTouchEnd: (e: React.TouchEvent) => {
    e.preventDefault();
    onPress();
  },
  onClick: onPress,
});

/** The style a ⌘/Ctrl shortcut asks for: B, I, U or E, or X or P with Shift. */
export function formatShortcut(e: React.KeyboardEvent): EntityType | undefined {
  if (!(e.metaKey || e.ctrlKey)) return undefined;
  const key = e.key.toLowerCase();
  return e.shiftKey
    ? ({ x: "strike", p: "spoiler" } as const)[key as "x" | "p"]
    : ({ b: "bold", i: "italic", u: "underline", e: "code" } as const)[key as "b" | "i" | "u" | "e"];
}

const glass =
  "flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl bg-white/70 p-1 shadow-lg ring-1 ring-stone-200 backdrop-blur-xl backdrop-saturate-150 dark:bg-stone-900/70 dark:ring-stone-800";
const item = "grid h-10 min-w-10 shrink-0 place-items-center rounded-lg px-2 text-stone-700 hover:bg-brand/20 dark:text-stone-200";
const HUES = "linear-gradient(90deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)";
const gradientCss = ([a, b]: readonly [string, string]) => `linear-gradient(135deg, ${a}, ${b})`;

/** A bar to drag or click along, without taking focus away from the message box. */
function Slider({ fill, at, onPick }: { fill: string; at: number; onPick: (x: number) => void }) {
  const bar = useRef<HTMLDivElement>(null);
  const pick = (e: React.PointerEvent) => {
    const box = bar.current!.getBoundingClientRect();
    onPick(Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)));
  };
  return (
    <div
      ref={bar}
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        pick(e);
      }}
      onPointerMove={(e) => e.buttons && pick(e)}
      className="relative h-6 w-full cursor-pointer touch-none rounded-full ring-1 ring-black/10"
      style={{ background: fill }}
    >
      <span
        className="pointer-events-none absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow ring-2 ring-black/20"
        style={{ left: `${at * 100}%` }}
      />
    </div>
  );
}

/** Any colour, or a gradient between two: a hue and a lightness for each end. */
function CustomColor({ onApply }: { onApply: (value: string) => void }) {
  const tr = useT();
  const [stops, setStops] = useState([
    { hue: 330, light: 0.55 },
    { hue: 220, light: 0.55 },
  ]);
  const [gradient, setGradient] = useState(false);
  const [editing, setEditing] = useState(0);
  const hex = stops.map((s) => hslHex(s.hue, s.light));
  const stop = stops[editing]!;
  const set = (patch: Partial<typeof stop>) => setStops(stops.map((s, i) => (i === editing ? { ...s, ...patch } : s)));
  const value = gradient ? `${hex[0]}-${hex[1]}` : hex[0]!;

  return (
    <div className={`${glass} w-72 flex-col items-stretch gap-2 p-3`}>
      <Slider fill={HUES} at={stop.hue / 360} onPick={(x) => set({ hue: x * 360 })} />
      <Slider fill={`linear-gradient(90deg, #000, ${hslHex(stop.hue, 0.5)}, #fff)`} at={stop.light} onPick={(x) => set({ light: x })} />
      <div className="flex items-center gap-2">
        {(gradient ? [0, 1] : [0]).map((i) => (
          <button
            key={i}
            type="button"
            {...keepSelection(() => setEditing(i))}
            aria-label={`${tr.composer.customColor} ${i + 1}`}
            aria-pressed={editing === i}
            className={`size-8 shrink-0 rounded-full ring-2 ${editing === i ? "ring-brand" : "ring-transparent"}`}
            style={{ background: hex[i] }}
          />
        ))}
        <button
          type="button"
          {...keepSelection(() => {
            setGradient(!gradient);
            setEditing(gradient ? 0 : 1);
          })}
          aria-pressed={gradient}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${gradient ? "bg-brand text-brand-ink" : "bg-stone-200/70 dark:bg-stone-800"}`}
        >
          {tr.composer.gradient}
        </button>
        <button
          type="button"
          {...keepSelection(() => onApply(value))}
          className="ml-auto rounded-full px-3 py-1.5 text-sm font-bold"
          style={gradient ? { backgroundImage: gradientCss([hex[0]!, hex[1]!]), color: "#fff" } : { background: hex[0], color: "#fff" }}
        >
          {tr.composer.apply}
        </button>
      </div>
    </div>
  );
}

type Panel = Paint | "custom" | "font" | "size";
/** What a colour paints: the letters, the background behind them, or a line around them. */
type Paint = "color" | "highlight" | "outline";

/**
 * The styles for the selected text, in a bar like the emoji suggestions: bold, italic, underline, strike, code
 * and spoiler, then a colour or gradient (ready-made or any), a font and a size, each picked from a row above.
 */
export function FormatBar({ onFormat }: { onFormat: (type: EntityType, value?: string) => void }) {
  const tr = useT();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [paint, setPaint] = useState<Paint>("color");
  const pick = (type: EntityType, value?: string) => {
    onFormat(type, value);
    setPanel(null);
  };
  const toggle = (p: Panel) => {
    if (p === "color" || p === "highlight" || p === "outline") setPaint(p);
    setPanel((now) => (now === p || (now === "custom" && p === paint) ? null : p));
  };
  const open = (p: Panel) => panel === p || (panel === "custom" && p === paint);
  const opener = (p: Panel, label: string, Icon: LucideIcon) => (
    <button
      type="button"
      {...keepSelection(() => toggle(p))}
      aria-label={label}
      aria-expanded={open(p)}
      title={label}
      className={`${item} ${open(p) ? "bg-brand/20" : ""}`}
    >
      <Icon className="size-[18px]" />
    </button>
  );

  return (
    <div role="toolbar" aria-label={tr.composer.formatting} className="flex max-w-full flex-col items-start gap-1">
      {(panel === "color" || panel === "highlight" || panel === "outline") && (
        <div className={glass}>
          {(Object.keys(TEXT_COLORS) as TextColor[]).map((c) => (
            <button key={c} type="button" {...keepSelection(() => pick(paint, c))} aria-label={tr.composer.textColors[c]} title={tr.composer.textColors[c]} className={item}>
              <span className="size-5 rounded-full ring-1 ring-stone-400/60" style={{ background: TEXT_COLORS[c] }} />
            </button>
          ))}
          <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-stone-300 dark:bg-stone-700" />
          {(Object.keys(TEXT_GRADIENTS) as TextGradient[]).map((g) => (
            <button key={g} type="button" {...keepSelection(() => pick(paint, g))} aria-label={tr.composer.textGradients[g]} title={tr.composer.textGradients[g]} className={item}>
              <span className="size-5 rounded-full ring-2 ring-white/70 dark:ring-black/30" style={{ backgroundImage: gradientCss(TEXT_GRADIENTS[g]) }} />
            </button>
          ))}
          <button type="button" {...keepSelection(() => setPanel("custom"))} aria-label={tr.composer.customColor} title={tr.composer.customColor} className={item}>
            <span className="grid size-5 place-items-center rounded-full text-white" style={{ background: "conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)" }}>
              <Plus className="size-3.5 drop-shadow" strokeWidth={3} />
            </span>
          </button>
        </div>
      )}
      {panel === "custom" && <CustomColor onApply={(v) => pick(paint, v)} />}
      {panel === "font" && (
        <div className={glass}>
          {TEXT_FONTS.map((f) => (
            <button key={f} type="button" {...keepSelection(() => pick("font", f))} className={`${item} px-3 text-base`} style={{ fontFamily: LABEL_FONTS[f] }}>
              {tr.composer.fonts[f]}
            </button>
          ))}
        </div>
      )}
      {panel === "size" && (
        <div className={glass}>
          {MESSAGE_TEXT_SIZES.map((n) => (
            <button key={n} type="button" {...keepSelection(() => pick("size", String(n)))} aria-label={`${tr.composer.formats.size} ${n} px`} className={`${item} min-w-12 font-semibold tabular-nums`}>
              <span>
                {n}
                <span className="ml-px text-[10px] font-medium opacity-60">px</span>
              </span>
            </button>
          ))}
        </div>
      )}
      <div className={glass}>
        {formats.map(({ type, keys, Icon }) => (
          <button
            key={type}
            type="button"
            {...keepSelection(() => pick(type))}
            aria-label={tr.composer.formats[type]}
            title={`${tr.composer.formats[type]} (${modifierKey()}${keys})`}
            className={item}
          >
            <Icon className="size-[18px]" />
          </button>
        ))}
        <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-stone-300 dark:bg-stone-700" />
        {opener("color", tr.composer.formats.color, Palette)}
        {opener("highlight", tr.composer.formats.highlight, Highlighter)}
        {opener("outline", tr.composer.formats.outline, TypeOutline)}
        {opener("font", tr.composer.formats.font, Type)}
        {opener("size", tr.composer.formats.size, ALargeSmall)}
      </div>
    </div>
  );
}
