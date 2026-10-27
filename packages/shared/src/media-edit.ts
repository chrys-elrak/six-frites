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
