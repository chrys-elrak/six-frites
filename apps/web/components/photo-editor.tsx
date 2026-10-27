"use client";

import { type CropHandle, type CropRect, FULL_CROP, cropPixels, dragCrop, turnCrop } from "@six/shared";
import { Check, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { Portal } from "./portal";

const PREVIEW_EDGE = 1600;
const CORNERS = ["nw", "ne", "sw", "se"] as const;

/** Draws the photo turned `turns` quarters counter-clockwise and cut to `crop`, at `scale`. */
function paint(canvas: HTMLCanvasElement, bitmap: ImageBitmap, turns: number, crop: CropRect, scale = 1) {
  const odd = turns % 2 === 1;
  const width = odd ? bitmap.height : bitmap.width;
  const height = odd ? bitmap.width : bitmap.height;
  const px = cropPixels(crop, width, height);
  canvas.width = Math.round(px.width * scale);
  canvas.height = Math.round(px.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.translate(width / 2 - px.originX, height / 2 - px.originY);
  ctx.rotate((-turns * Math.PI) / 2);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  return canvas;
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
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [turns, setTurns] = useState(0);
  const [crop, setCrop] = useState(FULL_CROP);
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ handle: CropHandle; x: number; y: number; from: CropRect } | null>(null);

  useEffect(() => {
    let gone = false;
    let made: ImageBitmap | undefined;
    createImageBitmap(file).then((b) => {
      made = b;
      if (gone) b.close();
      else setBitmap(b);
    }, onCancel);
    return () => {
      gone = true;
      made?.close();
    };
  }, [file]);

  useEffect(() => {
    if (bitmap && canvas.current) {
      paint(canvas.current, bitmap, turns, FULL_CROP, Math.min(1, PREVIEW_EDGE / Math.max(bitmap.width, bitmap.height)));
    }
  }, [bitmap, turns]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onCancel();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  const grab = (handle: CropHandle) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { handle, x: e.clientX, y: e.clientY, from: crop };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    const box = frame.current?.getBoundingClientRect();
    if (d && box) setCrop(dragCrop(d.from, d.handle, (e.clientX - d.x) / box.width, (e.clientY - d.y) / box.height));
  };
  const release = () => (drag.current = null);

  async function done() {
    if (!bitmap) return;
    if (!turns && crop === FULL_CROP) return onCancel();
    setBusy(true);
    const type = file.type === "image/png" || file.type === "image/webp" ? file.type : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) =>
      paint(document.createElement("canvas"), bitmap, turns, crop).toBlob(resolve, type, 0.92),
    );
    if (blob) onDone(new File([blob], file.name, { type: blob.type }));
    else onCancel();
  }

  const ratio = bitmap ? (turns % 2 ? bitmap.height / bitmap.width : bitmap.width / bitmap.height) : 1;
  const box = {
    left: `${crop.x * 100}%`,
    top: `${crop.y * 100}%`,
    width: `${crop.w * 100}%`,
    height: `${crop.h * 100}%`,
  };
  const tool = "grid size-11 place-items-center rounded-full transition active:scale-95";

  return (
    <Portal>
      <div className="fixed inset-0 z-[60] flex flex-col bg-black text-white" role="dialog" aria-modal aria-label={tr.composer.editPhoto}>
        <div className="flex min-h-0 flex-1 items-center justify-center p-6 [container-type:size]">
          {bitmap && (
            <div
              ref={frame}
              onPointerMove={move}
              onPointerUp={release}
              onPointerCancel={release}
              className="relative touch-none select-none"
              style={{ width: `min(100cqw, ${ratio * 100}cqh)`, aspectRatio: ratio }}
            >
              <canvas ref={canvas} className="size-full" />
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
            </div>
          )}
        </div>
        <div className="flex items-center justify-between px-6 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <button type="button" onClick={onCancel} aria-label={tr.common.cancel} className={`${tool} hover:bg-white/10`}>
            <X className="size-6" />
          </button>
          <button
            type="button"
            onClick={() => {
              setTurns((t) => (t + 1) % 4);
              setCrop(turnCrop);
            }}
            aria-label={tr.composer.rotate}
            title={tr.composer.rotate}
            className={`${tool} hover:bg-white/10`}
          >
            <RotateCcw className="size-6" />
          </button>
          <button
            type="button"
            onClick={done}
            disabled={!bitmap || busy}
            aria-label={tr.common.done}
            className={`${tool} bg-brand text-brand-ink disabled:opacity-50`}
          >
            <Check className="size-6" strokeWidth={2.4} />
          </button>
        </div>
      </div>
    </Portal>
  );
}
