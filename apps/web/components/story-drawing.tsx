"use client";

import {
  EDIT_COLORS,
  type LabelFont,
  STORY_LIMITS,
  STORY_PEN_SIZES,
  STORY_SHAPES,
  STORY_STICKER_SCALE,
  STORY_TEXT_LOOKS,
  STORY_TEXT_SIZE,
  type StoryDrawing,
  type StoryShape,
  type StoryTextLook,
  extendStroke,
  inkOn,
  startStroke,
  storyStrokePath,
  strokeTooSmall,
} from "@six/shared";
import { Check, Circle, MoveDiagonal2, MoveUpRight, Pencil, Square, Trash2, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { Colors, Fonts, Sizes, familyOf } from "./photo-editor";

export interface Pen {
  shape: StoryShape;
  color: string;
  size: number;
}

export interface Writing {
  index: number;
  text: string;
  color: string;
  font: LabelFont;
  look: StoryTextLook;
}

const SHAPE_ICONS = { pen: Pencil, arrow: MoveUpRight, circle: Circle, rect: Square };
const clamp = (v: number) => Math.min(1, Math.max(0, v));

function lookStyle(look: StoryTextLook | undefined, color: string): React.CSSProperties {
  if (look === "box") return { color: inkOn(color), background: color, padding: "0.1em 0.4em", borderRadius: "0.3em" };
  if (look === "outline") return { color, WebkitTextStroke: `0.16em ${inkOn(color)}`, paintOrder: "stroke fill" };
  return { color, textShadow: color === EDIT_COLORS[1] ? "0 0 6px rgba(255,255,255,0.85)" : "0 1px 6px rgba(0,0,0,0.6)" };
}

type Grab =
  | { kind: "stroke" }
  | { kind: "move"; index: number; x: number; y: number; from: { x: number; y: number }; moved: boolean }
  | { kind: "resize"; index: number; cx: number; cy: number; r0: number; from: number };

/**
 * What the poster drew on a story, filling an `absolute inset-0` layer. In the composer, `pen` turns the layer into a
 * canvas to draw on; without it, `onChange` lets each text be dragged and resized by its corner, and `onEditText` is
 * called when one is tapped. `onBegin` comes before each change, to keep it for undo.
 */
export function StoryDrawingLayer({
  drawing,
  pen,
  onBegin,
  onChange,
  onEditText,
}: {
  drawing: StoryDrawing;
  pen?: Pen | null;
  onBegin?: () => void;
  onChange?: (d: StoryDrawing) => void;
  onEditText?: (index: number) => void;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const latest = useRef(drawing);
  latest.current = drawing;
  const grab = useRef<Grab | null>(null);
  const [{ w, h }, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = layer.current!;
    const ob = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ob.observe(el);
    return () => ob.disconnect();
  }, []);

  const set = (d: StoryDrawing) => {
    latest.current = d;
    onChange?.(d);
  };
  const at = (e: React.PointerEvent): [number, number] => {
    const r = layer.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };

  function down(e: React.PointerEvent) {
    if (!pen || !onChange || latest.current.strokes.length >= 80) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    onBegin?.();
    grab.current = { kind: "stroke" };
    set({ ...latest.current, strokes: [...latest.current.strokes, startStroke(pen.shape, pen.color, pen.size, ...at(e))] });
  }

  function move(e: React.PointerEvent) {
    const g = grab.current;
    const d = latest.current;
    if (!g) return;
    if (g.kind === "stroke") {
      const strokes = d.strokes.slice();
      strokes[strokes.length - 1] = extendStroke(strokes.at(-1)!, ...at(e));
      return set({ ...d, strokes });
    }
    const texts = d.texts.slice();
    const t = texts[g.index]!;
    if (g.kind === "resize") {
      const scale = (g.from * Math.hypot(e.clientX - g.cx, e.clientY - g.cy)) / g.r0;
      texts[g.index] = { ...t, scale: Math.min(STORY_STICKER_SCALE.max, Math.max(STORY_STICKER_SCALE.min, scale)) };
      return set({ ...d, texts });
    }
    if (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 4) return;
    if (!g.moved) onBegin?.();
    g.moved = true;
    texts[g.index] = { ...t, x: clamp(g.from.x + (e.clientX - g.x) / w), y: clamp(g.from.y + (e.clientY - g.y) / h) };
    set({ ...d, texts });
  }

  function up() {
    const g = grab.current;
    grab.current = null;
    const last = latest.current.strokes.at(-1);
    if (g?.kind === "stroke" && last && strokeTooSmall(last)) set({ ...latest.current, strokes: latest.current.strokes.slice(0, -1) });
    if (g?.kind === "move" && !g.moved) onEditText?.(g.index);
  }

  const grabText = (index: number) => (e: React.PointerEvent) => {
    if (pen || !onChange) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const t = latest.current.texts[index]!;
    grab.current = { kind: "move", index, x: e.clientX, y: e.clientY, from: { x: t.x, y: t.y }, moved: false };
  };

  const grabSize = (index: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const r = layer.current!.getBoundingClientRect();
    const t = latest.current.texts[index]!;
    const [cx, cy] = [r.left + t.x * r.width, r.top + t.y * r.height];
    onBegin?.();
    grab.current = { kind: "resize", index, cx, cy, r0: Math.max(1, Math.hypot(e.clientX - cx, e.clientY - cy)), from: t.scale };
  };

  const editing = !!onChange && !pen;
  return (
    <div
      ref={layer}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      className={`absolute inset-0 overflow-hidden ${pen ? "cursor-crosshair touch-none" : "pointer-events-none"}`}
    >
      {w > 0 && (
        <svg width={w} height={h} className="pointer-events-none absolute inset-0">
          {drawing.strokes.map((s, i) => (
            <path
              key={i}
              d={storyStrokePath(s, w, h)}
              fill="none"
              stroke={s.color}
              strokeWidth={s.size * w}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </svg>
      )}
      {w > 0 &&
        drawing.texts.map((t, i) => (
          <div
            key={i}
            onPointerDown={grabText(i)}
            className={`absolute text-center leading-tight break-words whitespace-pre-wrap select-none ${editing ? "pointer-events-auto cursor-grab touch-none" : ""}`}
            style={{
              left: `${t.x * 100}%`,
              top: `${t.y * 100}%`,
              width: "max-content",
              maxWidth: w * 0.9,
              transform: "translate(-50%, -50%)",
              ...lookStyle(t.look, t.color),
              fontSize: STORY_TEXT_SIZE * t.scale * w,
              fontFamily: familyOf(t.font) ?? undefined,
              fontWeight: familyOf(t.font) ? 400 : 700,
            }}
          >
            {t.text}
            {editing && (
              <span
                onPointerDown={grabSize(i)}
                aria-hidden
                className="absolute -right-3 -bottom-3 grid size-6 cursor-nwse-resize touch-none place-items-center rounded-full bg-white text-stone-900 shadow ring-1 ring-black/10"
              >
                <MoveDiagonal2 className="size-3.5" strokeWidth={2.5} />
              </span>
            )}
          </div>
        ))}
    </div>
  );
}

const round = "grid size-10 shrink-0 place-items-center rounded-full transition active:scale-95";

/** The pen, arrow and shape tools, colours and sizes shown while drawing on a story. */
export function DrawBar({
  pen,
  onPen,
  canUndo,
  onUndo,
  onDone,
}: {
  pen: Pen;
  onPen: (p: Pen) => void;
  canUndo: boolean;
  onUndo: () => void;
  onDone: () => void;
}) {
  const tr = useT();
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-1 rounded-full bg-black/40 p-1 backdrop-blur">
        {STORY_SHAPES.map((shape) => {
          const Icon = SHAPE_ICONS[shape];
          return (
            <button
              key={shape}
              type="button"
              onClick={() => onPen({ ...pen, shape })}
              aria-label={tr.stories.shapes[shape]}
              aria-pressed={pen.shape === shape}
              title={tr.stories.shapes[shape]}
              className={`${round} ${pen.shape === shape ? "bg-white text-stone-900" : "hover:bg-white/15"}`}
            >
              <Icon className="size-5" />
            </button>
          );
        })}
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label={tr.composer.undo}
          title={tr.composer.undo}
          className={`${round} hover:bg-white/15 disabled:opacity-30`}
        >
          <Undo2 className="size-5" />
        </button>
        <button type="button" onClick={onDone} aria-label={tr.common.done} title={tr.common.done} className={`${round} bg-brand text-brand-ink`}>
          <Check className="size-5" strokeWidth={2.4} />
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Colors value={pen.color} onChange={(color) => onPen({ ...pen, color })} />
        <Sizes value={STORY_PEN_SIZES.indexOf(pen.size as (typeof STORY_PEN_SIZES)[number])} onChange={(i) => onPen({ ...pen, size: STORY_PEN_SIZES[i]! })} />
      </div>
    </div>
  );
}

/** Where the poster types text to put on a story, in a colour and a font; `onRemove` takes an existing one off. */
export function TextWriter({
  writing,
  onChange,
  onDone,
  onRemove,
}: {
  writing: Writing;
  onChange: (w: Writing) => void;
  onDone: () => void;
  onRemove?: () => void;
}) {
  const tr = useT();
  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-black/75 backdrop-blur-sm">
      <div className="flex items-center justify-between p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        {onRemove ? (
          <button type="button" onClick={onRemove} aria-label={tr.common.remove} title={tr.common.remove} className={`${round} hover:bg-white/10`}>
            <Trash2 className="size-6" />
          </button>
        ) : (
          <span />
        )}
        <button type="button" onClick={onDone} className="rounded-full bg-brand px-5 py-2 font-semibold text-brand-ink">
          {tr.common.done}
        </button>
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        <textarea
          autoFocus
          value={writing.text}
          onChange={(e) => onChange({ ...writing, text: e.target.value })}
          maxLength={STORY_LIMITS.drawnText}
          rows={3}
          placeholder={tr.composer.typeSomething}
          aria-label={tr.stories.addText}
          className="max-w-full min-w-24 resize-none bg-transparent text-center text-3xl outline-none [field-sizing:content] placeholder:text-white/40"
          style={{
            ...lookStyle(writing.look, writing.color),
            fontFamily: familyOf(writing.font) ?? undefined,
            fontWeight: familyOf(writing.font) ? 400 : 700,
          }}
        />
      </div>
      <div className="flex flex-col items-center gap-3 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-2">
          {STORY_TEXT_LOOKS.map((look) => (
            <button
              key={look}
              type="button"
              onClick={() => onChange({ ...writing, look })}
              aria-label={tr.stories.textLooks[look]}
              aria-pressed={writing.look === look}
              title={tr.stories.textLooks[look]}
              className={`${round} text-lg font-bold ${writing.look === look ? "bg-white/25 ring-2 ring-white" : "hover:bg-white/10"}`}
            >
              <span className="leading-none" style={lookStyle(look, writing.color)}>
                A
              </span>
            </button>
          ))}
        </div>
        <Fonts value={writing.font} onChange={(font) => onChange({ ...writing, font })} />
        <Colors value={writing.color} onChange={(color) => onChange({ ...writing, color })} />
      </div>
    </div>
  );
}
