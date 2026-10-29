"use client";

import {
  BLUR_SIZES,
  type CropHandle,
  type CropRect,
  EDIT_COLORS,
  EMOJI_SIZES,
  FULL_CROP,
  LABEL_FONTS,
  LABEL_LINE,
  type Label,
  type LabelFont,
  NO_EDIT,
  PEN_SIZES,
  type PhotoEdit,
  type Stroke,
  TEXT_SIZES,
  cropPixels,
  dragCrop,
  flipEdit,
  isEdited,
  labelAt,
  labelBox,
  orientedSize,
  scaleLabel,
  turnEdit,
} from "@six/shared";
import { Check, Crop, Droplet, FlipHorizontal2, Pencil, RotateCcw, Smile, Trash2, Type, Undo2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { Emojis } from "./emoji-picker";
import { Portal } from "./portal";

type Tool = "crop" | "draw" | "blur";
type Drag =
  | { kind: "crop"; handle: CropHandle; x: number; y: number; from: CropRect; moved: boolean }
  | { kind: "label"; index: number; x: number; y: number; from: Label; moved: boolean }
  | { kind: "resize"; index: number; cx: number; cy: number; r0: number; from: Label }
  | { kind: "stroke" };
interface Writing {
  index: number;
  text: string;
  color: string;
  size: number;
  font: LabelFont;
  emoji?: boolean;
}

const FONT_NAMES = Object.keys(LABEL_FONTS) as LabelFont[];
const familyOf = (font: LabelFont | undefined) => (font && LABEL_FONTS[font]) || null;
const fontsLoaded = () =>
  Promise.all(FONT_NAMES.flatMap((f) => (LABEL_FONTS[f] ? [document.fonts.load(`40px ${LABEL_FONTS[f]}`)] : [])));

const PREVIEW_EDGE = 1600;
const BLUR_DETAIL = 24;
const CORNERS = ["nw", "ne", "sw", "se"] as const;

function photo(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, bitmap: ImageBitmap, edit: PhotoEdit, width: number, height: number) {
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(edit.flipped ? -1 : 1, 1);
  ctx.rotate((-edit.turns * Math.PI) / 2);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  ctx.restore();
}

function line(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, s: Stroke, width: number, height: number) {
  ctx.beginPath();
  ctx.moveTo(s.points[0]! * width, s.points[1]! * height);
  for (let i = 0; i < s.points.length; i += 2) ctx.lineTo(s.points[i]! * width, s.points[i + 1]! * height);
  ctx.lineWidth = s.size * Math.max(width, height);
  ctx.lineCap = ctx.lineJoin = "round";
  ctx.strokeStyle = s.color;
  ctx.stroke();
}

function text(ctx: CanvasRenderingContext2D, l: Label, width: number, height: number) {
  const font = l.size * Math.max(width, height);
  const family = familyOf(l.font);
  ctx.font = family ? `${font}px ${family}, system-ui, sans-serif, "Noto Color Emoji"` : `700 ${font}px system-ui, sans-serif, "Noto Color Emoji"`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = font / 7;
  ctx.strokeStyle = l.color === EDIT_COLORS[1] ? "#fff" : "rgba(0,0,0,0.7)";
  ctx.fillStyle = l.color;
  const lines = l.text.split("\n");
  lines.forEach((s, i) => {
    const y = l.y * height + (i - (lines.length - 1) / 2) * font * LABEL_LINE;
    if (!l.emoji) ctx.strokeText(s, l.x * width, y);
    ctx.fillText(s, l.x * width, y);
  });
}

/**
 * Draws the photo as `edit` says, cut to `view` and scaled by `scale`. Blur strokes show a copy of the photo shrunk
 * to a few pixels and stretched back, so nothing under them can be read.
 */
function paint(canvas: HTMLCanvasElement, bitmap: ImageBitmap, edit: PhotoEdit, view: CropRect, scale = 1) {
  const { width, height } = orientedSize(bitmap.width, bitmap.height, edit.turns);
  const px = cropPixels(view, width, height);
  canvas.width = Math.max(1, Math.round(px.width * scale));
  canvas.height = Math.max(1, Math.round(px.height * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.translate(-px.originX, -px.originY);
  photo(ctx, bitmap, edit, width, height);

  const blurs = edit.strokes.filter((s) => s.blur);
  if (blurs.length) {
    const tiny = new OffscreenCanvas(BLUR_DETAIL, Math.max(1, Math.round((BLUR_DETAIL * height) / width)));
    const tc = tiny.getContext("2d")!;
    tc.scale(tiny.width / width, tiny.height / height);
    photo(tc, bitmap, edit, width, height);
    const layer = new OffscreenCanvas(canvas.width, canvas.height);
    const lc = layer.getContext("2d")!;
    lc.setTransform(ctx.getTransform());
    lc.drawImage(tiny, 0, 0, width, height);
    lc.globalCompositeOperation = "destination-in";
    blurs.forEach((s) => line(lc, s, width, height));
    ctx.save();
    ctx.resetTransform();
    ctx.drawImage(layer, 0, 0);
    ctx.restore();
  }
  edit.strokes.filter((s) => !s.blur).forEach((s) => line(ctx, s, width, height));
  edit.labels.forEach((l) => text(ctx, l, width, height));
  return canvas;
}

function Sizes({ value, onChange }: { value: number; onChange: (i: number) => void }) {
  const tr = useT();
  return (
    <div className="flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i)}
          aria-label={tr.composer.size(i + 1)}
          aria-pressed={value === i}
          className={`grid size-9 place-items-center rounded-full ${value === i ? "bg-white/25" : "hover:bg-white/10"}`}
        >
          <span className="rounded-full bg-white" style={{ width: 6 + i * 6, height: 6 + i * 6 }} />
        </button>
      ))}
    </div>
  );
}

function Fonts({ value, onChange }: { value: LabelFont; onChange: (f: LabelFont) => void }) {
  const tr = useT();
  return (
    <div className="flex max-w-full gap-2 overflow-x-auto px-1 py-1">
      {FONT_NAMES.map((f) => (
        <button
          key={f}
          type="button"
          onClick={() => onChange(f)}
          aria-pressed={value === f}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-[15px] ${value === f ? "bg-white text-black" : "bg-white/15 hover:bg-white/25"}`}
          style={{ fontFamily: familyOf(f) ?? undefined, fontWeight: familyOf(f) ? 400 : 700 }}
        >
          {tr.composer.fonts[f]}
        </button>
      ))}
    </div>
  );
}

function Colors({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const tr = useT();
  return (
    <div className="flex items-center gap-1.5">
      {EDIT_COLORS.map((c, i) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={tr.composer.color(i + 1)}
          aria-pressed={value === c}
          className={`size-7 rounded-full ring-white transition ${value === c ? "scale-110 ring-2 ring-offset-2 ring-offset-black" : "ring-1"}`}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}

export function PhotoEditor({
  file,
  onCancel,
  onDone,
}: {
  file: File;
  onCancel: () => void;
  onDone: (file: File) => void;
}) {
  const tr = useT();
  const [full, setFull] = useState<ImageBitmap | null>(null);
  const [small, setSmall] = useState<ImageBitmap | null>(null);
  const [edit, setEdit] = useState(NO_EDIT);
  const [history, setHistory] = useState<PhotoEdit[]>([]);
  const [tool, setTool] = useState<Tool | null>(null);
  const [color, setColor] = useState(EDIT_COLORS[2]!);
  const [size, setSize] = useState(1);
  const [writing, setWriting] = useState<Writing | null>(null);
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [, setFontsReady] = useState(false);
  useEffect(() => {
    void fontsLoaded()
      .catch(() => null)
      .then(() => setFontsReady(true));
  }, []);
  const canvas = useRef<HTMLCanvasElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const view = tool === "crop" ? FULL_CROP : edit.crop;

  useEffect(() => {
    let gone = false;
    const made: ImageBitmap[] = [];
    (async () => {
      const big = await createImageBitmap(file);
      made.push(big);
      const scale = Math.min(1, PREVIEW_EDGE / Math.max(big.width, big.height));
      const preview =
        scale < 1
          ? await createImageBitmap(big, {
              resizeWidth: Math.round(big.width * scale),
              resizeHeight: Math.round(big.height * scale),
              resizeQuality: "high",
            })
          : big;
      made.push(preview);
      if (gone) return;
      setFull(big);
      setSmall(preview);
    })().catch(onCancel);
    return () => {
      gone = true;
      made.forEach((b) => b.close());
    };
  }, [file]);

  const shown = writing ? { ...edit, labels: edit.labels.filter((_, i) => i !== writing.index) } : edit;
  useEffect(() => {
    if (small && canvas.current) paint(canvas.current, small, shown, view);
  });

  const change = (next: (e: PhotoEdit) => PhotoEdit) => {
    setHistory((h) => [...h, edit]);
    setEdit(next);
  };
  const undo = () => {
    const last = history.at(-1);
    if (!last) return;
    setHistory(history.slice(0, -1));
    setEdit(last);
    setSelected(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (writing) setWriting(null);
        else if (picking) setPicking(false);
        else onCancel();
      } else if (e.key === "z" && (e.metaKey || e.ctrlKey) && !writing) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const at = (e: React.PointerEvent): [number, number] => {
    const r = frame.current!.getBoundingClientRect();
    return [view.x + ((e.clientX - r.left) / r.width) * view.w, view.y + ((e.clientY - r.top) / r.height) * view.h];
  };

  const grab = (handle: CropHandle) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { kind: "crop", handle, x: e.clientX, y: e.clientY, from: edit.crop, moved: false };
  };

  function down(e: React.PointerEvent) {
    if (!small || tool === "crop") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y] = at(e);
    if (tool) {
      const stroke = { blur: tool === "blur" || undefined, color, size: (tool === "blur" ? BLUR_SIZES : PEN_SIZES)[size]!, points: [x, y] };
      change((ed) => ({ ...ed, strokes: [...ed.strokes, stroke] }));
      drag.current = { kind: "stroke" };
      return;
    }
    const { width, height } = orientedSize(small.width, small.height, edit.turns);
    const index = labelAt(edit.labels, x, y, width, height);
    if (index >= 0) drag.current = { kind: "label", index, x: e.clientX, y: e.clientY, from: edit.labels[index]!, moved: false };
    else setSelected(null);
  }

  function grabSize(e: React.PointerEvent) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const r = frame.current!.getBoundingClientRect();
    const from = edit.labels[selected!]!;
    const cx = r.left + ((from.x - view.x) / view.w) * r.width;
    const cy = r.top + ((from.y - view.y) / view.h) * r.height;
    setHistory((h) => [...h, edit]);
    drag.current = { kind: "resize", index: selected!, cx, cy, r0: Math.max(1, Math.hypot(e.clientX - cx, e.clientY - cy)), from };
  }

  function move(e: React.PointerEvent) {
    const d = drag.current;
    const r = frame.current?.getBoundingClientRect();
    if (!d || !r) return;
    if (d.kind === "resize") {
      const l = scaleLabel(d.from, Math.hypot(e.clientX - d.cx, e.clientY - d.cy) / d.r0);
      setEdit((ed) => ({ ...ed, labels: ed.labels.map((it, i) => (i === d.index ? l : it)) }));
      return;
    }
    if (d.kind === "stroke") {
      const [x, y] = at(e);
      setEdit((ed) => {
        const strokes = ed.strokes.slice();
        const last = strokes.at(-1)!;
        strokes[strokes.length - 1] = { ...last, points: [...last.points, x, y] };
        return { ...ed, strokes };
      });
      return;
    }
    const dx = (e.clientX - d.x) / r.width;
    const dy = (e.clientY - d.y) / r.height;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return;
    if (!d.moved) setHistory((h) => [...h, edit]);
    d.moved = true;
    if (d.kind === "crop") setEdit((ed) => ({ ...ed, crop: dragCrop(d.from, d.handle, dx, dy) }));
    else {
      const l = { ...d.from, x: d.from.x + dx * view.w, y: d.from.y + dy * view.h };
      setEdit((ed) => ({ ...ed, labels: ed.labels.map((it, i) => (i === d.index ? l : it)) }));
    }
  }

  function up() {
    const d = drag.current;
    drag.current = null;
    if (d?.kind !== "label") return;
    if (d.moved || selected !== d.index) return setSelected(d.index);
    const l = d.from;
    const sizes = l.emoji ? EMOJI_SIZES : TEXT_SIZES;
    setWriting({ index: d.index, text: l.text, color: l.color, size: sizes.indexOf(l.size), font: l.font ?? "classic", emoji: l.emoji });
  }

  function finishWriting() {
    const w = writing!;
    setWriting(null);
    const words = w.emoji ? w.text : w.text.trim();
    if (!words && w.index < 0) return;
    setSelected(!words ? null : w.index < 0 ? edit.labels.length : w.index);
    const label: Label = {
      ...(w.emoji && { emoji: true }),
      ...(w.font !== "classic" && { font: w.font }),
      text: words,
      color: w.color,
      size: (w.emoji ? EMOJI_SIZES : TEXT_SIZES)[w.size] ?? edit.labels[w.index]!.size,
      x: edit.labels[w.index]?.x ?? view.x + view.w / 2,
      y: edit.labels[w.index]?.y ?? view.y + view.h / 2,
    };
    change((ed) => ({
      ...ed,
      labels: !words
        ? ed.labels.filter((_, i) => i !== w.index)
        : w.index < 0
          ? [...ed.labels, label]
          : ed.labels.map((l, i) => (i === w.index ? label : l)),
    }));
  }

  function addEmoji(emoji: string) {
    setPicking(false);
    const label = { emoji: true, text: emoji, color: "#fff", size: EMOJI_SIZES[1]!, x: view.x + view.w / 2, y: view.y + view.h / 2 };
    setSelected(edit.labels.length);
    change((ed) => ({ ...ed, labels: [...ed.labels, label] }));
  }

  async function done() {
    if (!full) return;
    if (!isEdited(edit)) return onCancel();
    setBusy(true);
    await fontsLoaded().catch(() => null);
    const type = file.type === "image/png" || file.type === "image/webp" ? file.type : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) =>
      paint(document.createElement("canvas"), full, edit, edit.crop).toBlob(resolve, type, 0.92),
    );
    if (blob) onDone(new File([blob], file.name, { type: blob.type }));
    else onCancel();
  }

  const oriented = small ? orientedSize(small.width, small.height, edit.turns) : { width: 1, height: 1 };
  const ratio = (oriented.width * view.w) / (oriented.height * view.h);
  const box = {
    left: `${edit.crop.x * 100}%`,
    top: `${edit.crop.y * 100}%`,
    width: `${edit.crop.w * 100}%`,
    height: `${edit.crop.h * 100}%`,
  };
  const chosen = !tool && !writing && selected !== null ? edit.labels[selected] : undefined;
  const half = chosen && labelBox(chosen, oriented.width, oriented.height);
  const selection = chosen &&
    half && {
      left: `${((chosen.x - view.x) / view.w - half.halfW / (oriented.width * view.w)) * 100}%`,
      top: `${((chosen.y - view.y) / view.h - half.halfH / (oriented.height * view.h)) * 100}%`,
      width: `${((2 * half.halfW) / (oriented.width * view.w)) * 100}%`,
      height: `${((2 * half.halfH) / (oriented.height * view.h)) * 100}%`,
    };
  const round = "grid size-11 shrink-0 place-items-center rounded-full transition active:scale-95";
  const pick = (t: Tool) => {
    setSelected(null);
    setTool((now) => (now === t ? null : t));
  };
  const tools = [
    { id: "crop" as const, Icon: Crop, label: tr.composer.editTools.crop, onClick: () => pick("crop") },
    { id: "draw" as const, Icon: Pencil, label: tr.composer.editTools.draw, onClick: () => pick("draw") },
    { id: "blur" as const, Icon: Droplet, label: tr.composer.editTools.blur, onClick: () => pick("blur") },
    {
      id: null,
      Icon: Type,
      label: tr.composer.editTools.text,
      onClick: () => {
        setTool(null);
        setSelected(null);
        setWriting({ index: -1, text: "", color: EDIT_COLORS[0]!, size: 1, font: "classic" });
      },
    },
    {
      id: null,
      Icon: Smile,
      label: tr.composer.editTools.emoji,
      onClick: () => {
        setTool(null);
        setPicking(true);
      },
    },
  ];

  return (
    <Portal>
      <div className="fixed inset-0 z-[60] flex flex-col bg-black text-white" role="dialog" aria-modal aria-label={tr.composer.editPhoto}>
        <div className="flex items-center justify-between px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <button type="button" onClick={onCancel} aria-label={tr.common.cancel} className={`${round} hover:bg-white/10`}>
            <X className="size-6" />
          </button>
          <button
            type="button"
            onClick={undo}
            disabled={!history.length}
            aria-label={tr.composer.undo}
            title={tr.composer.undo}
            className={`${round} hover:bg-white/10 disabled:opacity-30`}
          >
            <Undo2 className="size-6" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center p-6 [container-type:size]">
          {small && (
            <div
              ref={frame}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
              className={`relative touch-none select-none ${tool === "draw" || tool === "blur" ? "cursor-crosshair" : ""}`}
              style={{ width: `min(100cqw, ${ratio * 100}cqh)`, aspectRatio: ratio }}
            >
              <canvas ref={canvas} className="size-full" />
              {selection && (
                <div className="pointer-events-none absolute rounded-md border-2 border-dashed border-white/90" style={selection}>
                  <span
                    onPointerDown={grabSize}
                    aria-hidden
                    className="pointer-events-auto absolute right-0 bottom-0 grid size-10 translate-x-1/2 translate-y-1/2 cursor-nwse-resize place-items-center"
                  >
                    <span className="size-4 rounded-full border-2 border-black/40 bg-white shadow" />
                  </span>
                </div>
              )}
              {tool === "crop" && (
                <>
                  <div className="pointer-events-none absolute inset-0 overflow-hidden">
                    <div className="absolute shadow-[0_0_0_100vmax_rgba(0,0,0,0.6)]" style={box} />
                  </div>
                  <div onPointerDown={grab("move")} className="absolute cursor-move border-2 border-white" style={box}>
                    {CORNERS.map((corner) => (
                      <span
                        key={corner}
                        onPointerDown={grab(corner)}
                        className="absolute grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center"
                        style={{
                          left: corner[1] === "w" ? 0 : "100%",
                          top: corner[0] === "n" ? 0 : "100%",
                          cursor: `${corner}-resize`,
                        }}
                      >
                        <span className="size-4 rounded-full bg-white shadow" />
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex min-h-14 items-center justify-center gap-3 px-4">
          {tool === "crop" && (
            <>
              <button
                type="button"
                onClick={() => change(turnEdit)}
                aria-label={tr.composer.rotate}
                title={tr.composer.rotate}
                className={`${round} hover:bg-white/10`}
              >
                <RotateCcw className="size-6" />
              </button>
              <button
                type="button"
                onClick={() => change(flipEdit)}
                aria-label={tr.composer.flip}
                title={tr.composer.flip}
                className={`${round} hover:bg-white/10`}
              >
                <FlipHorizontal2 className="size-6" />
              </button>
            </>
          )}
          {tool === "draw" && <Colors value={color} onChange={setColor} />}
          {(tool === "draw" || tool === "blur") && <Sizes value={size} onChange={setSize} />}
        </div>

        <div className="flex items-center justify-between gap-2 px-3 pt-1 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex flex-1 justify-center gap-1">
            {tools.map(({ id, Icon, label, onClick }) => (
              <button
                key={label}
                type="button"
                onClick={onClick}
                aria-label={label}
                aria-pressed={id ? tool === id : undefined}
                title={label}
                className={`${round} ${id && tool === id ? "bg-white text-black" : "hover:bg-white/10"}`}
              >
                <Icon className="size-6" />
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={done}
            disabled={!full || busy}
            aria-label={tr.common.done}
            className={`${round} bg-brand text-brand-ink disabled:opacity-50`}
          >
            <Check className="size-6" strokeWidth={2.4} />
          </button>
        </div>

        {writing && (
          <div className="absolute inset-0 z-10 flex flex-col bg-black/75 backdrop-blur-sm">
            <div className="flex items-center justify-between px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
              {writing.index >= 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setWriting(null);
                    setSelected(null);
                    change((ed) => ({ ...ed, labels: ed.labels.filter((_, i) => i !== writing.index) }));
                  }}
                  aria-label={tr.common.remove}
                  className={`${round} hover:bg-white/10`}
                >
                  <Trash2 className="size-6" />
                </button>
              ) : (
                <span />
              )}
              <button type="button" onClick={finishWriting} className="rounded-full bg-brand px-5 py-2 font-semibold text-brand-ink">
                {tr.common.done}
              </button>
            </div>
            <div className="flex flex-1 items-center justify-center p-6">
              <textarea
                autoFocus
                value={writing.text}
                onChange={(e) => setWriting({ ...writing, text: e.target.value })}
                rows={3}
                placeholder={tr.composer.typeSomething}
                aria-label={tr.composer.editTools.text}
                className="w-full max-w-lg resize-none bg-transparent text-center font-bold outline-none placeholder:text-white/40"
                style={{
                  color: writing.emoji ? undefined : writing.color,
                  fontSize: writing.emoji ? 64 : ([24, 32, 44][writing.size] ?? 32),
                  fontFamily: familyOf(writing.font) ?? undefined,
                  fontWeight: familyOf(writing.font) ? 400 : 700,
                }}
              />
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              {!writing.emoji && <Fonts value={writing.font} onChange={(f) => setWriting({ ...writing, font: f })} />}
              {!writing.emoji && <Colors value={writing.color} onChange={(c) => setWriting({ ...writing, color: c })} />}
              <Sizes value={writing.size} onChange={(i) => setWriting({ ...writing, size: i })} />
            </div>
          </div>
        )}

        {picking && (
          <div className="absolute inset-0 z-10 flex flex-col justify-end">
            <button aria-label={tr.common.cancel} onClick={() => setPicking(false)} className="absolute inset-0 bg-black/50" />
            <div className="relative flex h-[min(60dvh,420px)] flex-col overflow-hidden rounded-t-3xl bg-white text-stone-900 dark:bg-stone-900 dark:text-stone-100">
              <Emojis onPick={addEmoji} />
            </div>
          </div>
        )}
      </div>
    </Portal>
  );
}
