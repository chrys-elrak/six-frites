/** A crop box as fractions (0 to 1) of the photo, after any rotation. */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type CropHandle = "move" | "nw" | "ne" | "sw" | "se";

export const FULL_CROP: CropRect = { x: 0, y: 0, w: 1, h: 1 };

const MIN_CROP = 0.08;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Drags a corner of the crop box, or the whole box, by dx and dy (fractions of the photo), keeping it inside. */
export function dragCrop(c: CropRect, handle: CropHandle, dx: number, dy: number): CropRect {
  if (handle === "move") return { ...c, x: clamp(c.x + dx, 0, 1 - c.w), y: clamp(c.y + dy, 0, 1 - c.h) };
  let { x, y } = c;
  let right = c.x + c.w;
  let bottom = c.y + c.h;
  if (handle[1] === "w") x = clamp(x + dx, 0, right - MIN_CROP);
  else right = clamp(right + dx, x + MIN_CROP, 1);
  if (handle[0] === "n") y = clamp(y + dy, 0, bottom - MIN_CROP);
  else bottom = clamp(bottom + dy, y + MIN_CROP, 1);
  return { x, y, w: right - x, h: bottom - y };
}

/** Where the crop box lands when the photo turns a quarter counter-clockwise. */
export const turnCrop = (c: CropRect): CropRect => ({ x: c.y, y: 1 - c.x - c.w, w: c.h, h: c.w });

export function cropPixels(c: CropRect, width: number, height: number) {
  const originX = Math.round(c.x * width);
  const originY = Math.round(c.y * height);
  return {
    originX,
    originY,
    width: clamp(Math.round(c.w * width), 1, width - originX),
    height: clamp(Math.round(c.h * height), 1, height - originY),
  };
}

/** A pen or blur stroke: points are x, y pairs as fractions of the photo, size a fraction of its longer side. */
export interface Stroke {
  blur?: boolean;
  color: string;
  size: number;
  points: number[];
}

/** Fonts for text on photos. Both apps ship these files and load them under these family names. */
export const LABEL_FONTS = {
  classic: null,
  serif: "DMSerifDisplay",
  marker: "PermanentMarker",
  script: "Pacifico",
  typewriter: "SpecialElite",
} as const;
export type LabelFont = keyof typeof LABEL_FONTS;

/** Text or an emoji centred on x, y (fractions of the photo); size is a fraction of the longer side. */
export interface Label {
  emoji?: boolean;
  font?: LabelFont;
  text: string;
  x: number;
  y: number;
  size: number;
  color: string;
}

/**
 * Everything done to a photo in the editor. The photo is turned `turns` quarters counter-clockwise, then
 * mirrored when `flipped`; the crop box, strokes and labels are all placed on that turned photo.
 */
export interface PhotoEdit {
  turns: number;
  flipped: boolean;
  crop: CropRect;
  strokes: Stroke[];
  labels: Label[];
}

export const NO_EDIT: PhotoEdit = { turns: 0, flipped: false, crop: FULL_CROP, strokes: [], labels: [] };

export const EDIT_COLORS = ["#ffffff", "#111111", "#ef4444", "#f97316", "#facc15", "#22c55e", "#3b82f6", "#a855f7"];
export const PEN_SIZES = [0.006, 0.012, 0.024];
export const BLUR_SIZES = [0.04, 0.07, 0.11];
export const TEXT_SIZES = [0.045, 0.07, 0.1];
export const EMOJI_SIZES = [0.08, 0.14, 0.22];
export const LABEL_LINE = 1.2;

export const orientedSize = (width: number, height: number, turns: number) =>
  turns % 2 ? { width: height, height: width } : { width, height };

function moveAll(e: PhotoEdit, f: (x: number, y: number) => [number, number]) {
  return {
    strokes: e.strokes.map((s) => ({ ...s, points: s.points.flatMap((v, i) => (i % 2 ? [] : f(v, s.points[i + 1]!))) })),
    labels: e.labels.map((l) => {
      const [x, y] = f(l.x, l.y);
      return { ...l, x, y };
    }),
  };
}

/** Turns the photo and everything on it a quarter counter-clockwise; labels move with it but stay upright. */
export const turnEdit = (e: PhotoEdit): PhotoEdit => ({
  turns: (e.turns + (e.flipped ? 3 : 1)) % 4,
  flipped: e.flipped,
  crop: turnCrop(e.crop),
  ...moveAll(e, (x, y) => [y, 1 - x]),
});

/** Mirrors the photo and everything on it left to right; labels move with it but still read normally. */
export const flipEdit = (e: PhotoEdit): PhotoEdit => ({
  turns: e.turns,
  flipped: !e.flipped,
  crop: { ...e.crop, x: 1 - e.crop.x - e.crop.w },
  ...moveAll(e, (x, y) => [1 - x, y]),
});

export const isEdited = (e: PhotoEdit) =>
  e.turns > 0 || e.flipped || e.strokes.length > 0 || e.labels.length > 0 || e.crop.w < 1 || e.crop.h < 1;

/** Half the width and height, in pixels, of a label on a width × height photo, guessed from its text. */
export function labelBox(l: Label, width: number, height: number) {
  const font = l.size * Math.max(width, height);
  const lines = l.text.split("\n");
  return {
    halfW: (Math.max(...lines.map((s) => [...s].length)) * 0.62 * font) / 2 + font * 0.3,
    halfH: (lines.length * LABEL_LINE * font) / 2 + font * 0.3,
  };
}

/** The topmost label under x, y (fractions of a width × height photo), or -1. */
export function labelAt(labels: Label[], x: number, y: number, width: number, height: number) {
  for (let i = labels.length - 1; i >= 0; i--) {
    const l = labels[i]!;
    const { halfW, halfH } = labelBox(l, width, height);
    if (Math.abs((x - l.x) * width) <= halfW && Math.abs((y - l.y) * height) <= halfH) return i;
  }
  return -1;
}

/** A label scaled by `factor`, kept between barely readable and most of the photo. */
export const scaleLabel = (l: Label, factor: number): Label => ({ ...l, size: clamp(l.size * factor, 0.015, 0.6) });

interface Box {
  type: string;
  start: number;
  body: number;
  end: number;
}

function* boxes(view: DataView, from: number, to: number): Generator<Box> {
  for (let at = from; at + 8 <= to; ) {
    let size = view.getUint32(at);
    let body = at + 8;
    if (size === 1) {
      size = view.getUint32(at + 8) * 2 ** 32 + view.getUint32(at + 12);
      body += 8;
    } else if (size === 0) size = to - at;
    if (size < body - at || at + size > to) return;
    const type = String.fromCharCode(...new Uint8Array(view.buffer, view.byteOffset + at + 4, 4));
    yield { type, start: at, body, end: at + size };
    at += size;
  }
}

function child(view: DataView, box: Box, type: string) {
  for (const b of boxes(view, box.body, box.end)) if (b.type === type) return b;
}

function descend(view: DataView, box: Box, path: string[]) {
  let at: Box | undefined = box;
  for (const type of path) at = at && child(view, at, type);
  return at;
}

/** The byte ranges of a track's samples, from its chunk offsets, samples per chunk and sample sizes. */
function sampleRanges(view: DataView, stbl: Box): [number, number][] | null {
  const stco = child(view, stbl, "stco") ?? child(view, stbl, "co64");
  const stsc = child(view, stbl, "stsc");
  const stsz = child(view, stbl, "stsz");
  if (!stco || !stsc || !stsz) return null;
  const wide = stco.type === "co64";
  const runs = view.getUint32(stsc.body + 4);
  const fixed = view.getUint32(stsz.body + 4);
  const samples = view.getUint32(stsz.body + 8);
  let sample = 0;
  let run = 0;
  return Array.from({ length: view.getUint32(stco.body + 4) }, (_, chunk): [number, number] => {
    const at = stco.body + 8 + chunk * (wide ? 8 : 4);
    const offset = wide ? view.getUint32(at) * 2 ** 32 + view.getUint32(at + 4) : view.getUint32(at);
    while (run + 1 < runs && view.getUint32(stsc.body + 8 + (run + 1) * 12) <= chunk + 1) run++;
    let length = 0;
    for (let k = runs ? view.getUint32(stsc.body + 12 + run * 12) : 0; k > 0 && sample < samples; k--, sample++) {
      length += fixed || view.getUint32(stsz.body + 12 + sample * 4);
    }
    return [offset, length];
  });
}

/**
 * Takes the sound out of an MP4 or MOV in place, without re-encoding: each sound track becomes a `free` box of the
 * same size, so no offsets move, and its samples are zeroed so the audio can't be recovered from the file.
 * Returns false when it can't (not MP4/MOV, fragmented, unreadable); true means the file now has no sound.
 */
export function stripAudio(bytes: Uint8Array): boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    const top = [...boxes(view, 0, bytes.length)];
    const moov = top.find((b) => b.type === "moov");
    if (!moov || top.some((b) => b.type === "moof") || child(view, moov, "mvex")) return false;
    const sound = [...boxes(view, moov.body, moov.end)].filter((b) => {
      const hdlr = b.type === "trak" && descend(view, b, ["mdia", "hdlr"]);
      return hdlr && String.fromCharCode(...bytes.subarray(hdlr.body + 8, hdlr.body + 12)) === "soun";
    });
    const ranges: [number, number][] = [];
    for (const trak of sound) {
      const stbl = descend(view, trak, ["mdia", "minf", "stbl"]);
      const found = stbl && sampleRanges(view, stbl);
      if (!found) return false;
      ranges.push(...found);
    }
    ranges.forEach(([offset, length]) => bytes.fill(0, offset, offset + length));
    sound.forEach((trak) => bytes.set([0x66, 0x72, 0x65, 0x65], trak.start + 4));
    return true;
  } catch {
    return false;
  }
}
