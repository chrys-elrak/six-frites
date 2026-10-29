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

interface Sample {
  offset: number;
  size: number;
  dts: number;
  /** Composition offset: the sample shows at dts + cto. */
  cto: number;
  duration: number;
  /** Which sample description (stsd entry) it uses, from 1. */
  sdi: number;
  sync: boolean;
}

interface Track {
  trak: Box;
  tkhd: Box;
  mdia: Box;
  mdhd: Box;
  minf: Box;
  stbl: Box;
  video: boolean;
  timescale: number;
  samples: Sample[];
  hasCtts: boolean;
  hasStss: boolean;
  /** From the edit list: media time `mediaTime` shows `lead` seconds into the movie. */
  mediaTime: number;
  lead: number;
}

const tag = (view: DataView, at: number) =>
  String.fromCharCode(view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2), view.getUint8(at + 3));

const u64 = (view: DataView, at: number) => view.getUint32(at) * 2 ** 32 + view.getUint32(at + 4);

/** A track's samples with where they sit, when they decode and show; undefined for tracks other than video and sound. */
function readTrack(view: DataView, trak: Box, movieScale: number): Track | undefined {
  const tkhd = child(view, trak, "tkhd");
  const mdia = child(view, trak, "mdia");
  const mdhd = mdia && child(view, mdia, "mdhd");
  const hdlr = mdia && child(view, mdia, "hdlr");
  const minf = mdia && child(view, mdia, "minf");
  const stbl = minf && child(view, minf, "stbl");
  if (!tkhd || !mdia || !mdhd || !hdlr || !minf || !stbl) throw new Error("track");
  const handler = tag(view, hdlr.body + 8);
  if (handler !== "vide" && handler !== "soun") return undefined;
  const timescale = view.getUint32(mdhd.body + (view.getUint8(mdhd.body) === 1 ? 20 : 12));
  const stts = child(view, stbl, "stts");
  const stsz = child(view, stbl, "stsz");
  const stsc = child(view, stbl, "stsc");
  const stco = child(view, stbl, "stco") ?? child(view, stbl, "co64");
  const ctts = child(view, stbl, "ctts");
  const stss = child(view, stbl, "stss");
  if (!stts || !stsz || !stsc || !stco || !timescale) throw new Error("sample table");

  const count = view.getUint32(stsz.body + 8);
  const fixed = view.getUint32(stsz.body + 4);
  const samples: Sample[] = [];
  let dts = 0;
  for (let e = 0, n = view.getUint32(stts.body + 4); e < n; e++) {
    const runLength = view.getUint32(stts.body + 8 + e * 8);
    const duration = view.getUint32(stts.body + 12 + e * 8);
    for (let k = 0; k < runLength && samples.length < count; k++, dts += duration) {
      const size = fixed || view.getUint32(stsz.body + 12 + samples.length * 4);
      samples.push({ offset: 0, size, dts, cto: 0, duration, sdi: 1, sync: !stss });
    }
  }
  if (samples.length !== count) throw new Error("stts");
  if (ctts) {
    let i = 0;
    for (let e = 0, n = view.getUint32(ctts.body + 4); e < n; e++) {
      const offset = view.getInt32(ctts.body + 12 + e * 8);
      for (let k = view.getUint32(ctts.body + 8 + e * 8); k > 0 && i < count; k--) samples[i++]!.cto = offset;
    }
  }
  if (stss) {
    for (let e = 0, n = view.getUint32(stss.body + 4); e < n; e++) {
      const s = samples[view.getUint32(stss.body + 8 + e * 4) - 1];
      if (s) s.sync = true;
    }
  }

  const wide = stco.type === "co64";
  const runs = view.getUint32(stsc.body + 4);
  let i = 0;
  for (let chunk = 0, run = 0, n = view.getUint32(stco.body + 4); chunk < n; chunk++) {
    while (run + 1 < runs && view.getUint32(stsc.body + 8 + (run + 1) * 12) <= chunk + 1) run++;
    const perChunk = view.getUint32(stsc.body + 12 + run * 12);
    const sdi = view.getUint32(stsc.body + 16 + run * 12);
    let at = wide ? u64(view, stco.body + 8 + chunk * 8) : view.getUint32(stco.body + 8 + chunk * 4);
    for (let k = 0; k < perChunk && i < count; k++, i++) {
      samples[i]!.offset = at;
      samples[i]!.sdi = sdi;
      at += samples[i]!.size;
    }
  }
  if (i !== count) throw new Error("stsc");

  let lead = 0;
  let mediaTime = 0;
  const elst = descend(view, trak, ["edts", "elst"]);
  if (elst) {
    const v1 = view.getUint8(elst.body) === 1;
    for (let e = 0, n = view.getUint32(elst.body + 4); e < n; e++) {
      const at = elst.body + 8 + e * (v1 ? 20 : 12);
      const duration = v1 ? u64(view, at) : view.getUint32(at);
      const time = v1 ? view.getInt32(at + 8) * 2 ** 32 + view.getUint32(at + 12) : view.getInt32(at + 4);
      if (time !== -1) {
        mediaTime = time;
        break;
      }
      lead += duration;
    }
  }
  return {
    trak,
    tkhd,
    mdia,
    mdhd,
    minf,
    stbl,
    video: handler === "vide",
    timescale,
    samples,
    hasCtts: !!ctts,
    hasStss: !!stss,
    mediaTime,
    lead: lead / movieScale,
  };
}

/** The second at which a sample shows in the movie. */
const shownAt = (t: Track, s: Sample) => (s.dts + s.cto - t.mediaTime) / t.timescale + t.lead;

function readMovie(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const top = [...boxes(view, 0, bytes.length)];
  const moov = top.find((b) => b.type === "moov");
  const mvhd = moov && child(view, moov, "mvhd");
  if (!moov || !mvhd || top.some((b) => b.type === "moof") || child(view, moov, "mvex")) return null;
  const v1 = view.getUint8(mvhd.body) === 1;
  const scale = view.getUint32(mvhd.body + (v1 ? 20 : 12));
  const duration = (v1 ? u64(view, mvhd.body + 24) : view.getUint32(mvhd.body + 16)) / scale;
  const tracks = [...boxes(view, moov.body, moov.end)]
    .filter((b) => b.type === "trak")
    .map((b) => readTrack(view, b, scale))
    .filter((t): t is Track => !!t);
  const video = tracks.find((t) => t.video && t.samples.length);
  return video && scale ? { view, top, moov, mvhd, scale, duration, tracks, video } : null;
}

/**
 * How long an MP4 or MOV is, in seconds, and the keyframes a cut can start on. Null when it can't be cut:
 * not MP4/MOV, fragmented, or unreadable.
 */
export function videoCuts(bytes: Uint8Array) {
  try {
    const movie = readMovie(bytes);
    if (!movie) return null;
    const { video } = movie;
    const keyframes = video.samples
      .filter((s) => s.sync)
      .map((s) => Math.max(0, shownAt(video, s)))
      .sort((a, b) => a - b);
    return keyframes.length ? { duration: movie.duration, keyframes } : null;
  } catch {
    return null;
  }
}

/** Where a cut starting at `from` really starts: the last keyframe at or before it. */
export const cutStart = (keyframes: number[], from: number) =>
  keyframes.reduce((at, k) => (k <= from + 1e-3 ? k : at), keyframes[0] ?? 0);

/**
 * The samples of a track that show between `from` and `to`. Video keeps a run in decode order from the keyframe
 * that shows at `from`, so every frame it keeps can still be decoded; the edit list hides what falls outside.
 */
function keep(t: Track, from: number, to: number) {
  const shown = t.samples.map((s) => shownAt(t, s));
  let a = -1;
  let b = -1;
  t.samples.forEach((s, i) => {
    if (t.video ? s.sync && shown[i]! <= from + 1e-6 : a < 0 && shown[i]! + s.duration / t.timescale > from) a = i;
    if (shown[i]! < to) b = i;
  });
  if (t.video && a < 0) a = t.samples.findIndex((s) => s.sync);
  const samples = a >= 0 && b >= a ? t.samples.slice(a, b + 1) : [];
  const mediaTime = samples.length ? Math.max(0, Math.round((from - t.lead) * t.timescale + t.mediaTime) - samples[0]!.dts) : 0;
  return { track: t, samples, mediaTime };
}

function box(type: string, ...parts: Uint8Array[]) {
  const size = parts.reduce((n, p) => n + p.length, 8);
  const out = new Uint8Array(size);
  new DataView(out.buffer).setUint32(0, size);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  let at = 8;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function words(values: number[]) {
  const out = new Uint8Array(values.length * 4);
  const view = new DataView(out.buffer);
  values.forEach((v, i) => view.setUint32(i * 4, v >>> 0));
  return out;
}

/** Equal neighbours folded into [count, value] pairs, as stts and ctts store them. */
function runsOf(values: number[]) {
  const out: [number, number][] = [];
  for (const v of values) {
    const last = out.at(-1);
    if (last && last[1] === v) last[0]++;
    else out.push([1, v]);
  }
  return out;
}

const CHUNK_SECONDS = 0.5;

/**
 * Cuts an MP4 or MOV down to `from`–`to` seconds without re-encoding. The start moves back to the keyframe at or
 * before `from` (see `cutStart`), since a video can only start playing on one. The new file has only video and
 * sound tracks, keeps none of the cut-off frames or sound, and puts its index first so it streams. Null when it
 * can't (see `videoCuts`).
 */
export function trimVideo(bytes: Uint8Array, from: number, to: number): Uint8Array<ArrayBuffer> | null {
  try {
    const movie = readMovie(bytes);
    if (!movie) return null;
    const { view, scale } = movie;
    const keyframes = movie.video.samples.filter((s) => s.sync).map((s) => shownAt(movie.video, s));
    const start = cutStart(keyframes.sort((a, b) => a - b), from);
    const end = Math.min(to, movie.duration);
    if (end - start < 0.1) return null;
    const kept = movie.tracks.map((t) => keep(t, start, end)).filter((k) => k.samples.length);
    if (!kept.some((k) => k.track.video)) return null;
    const segment = Math.round((end - start) * scale);

    const chunks = kept.map((k) => {
      const list: { first: number; count: number; sdi: number; time: number; offset: number }[] = [];
      k.samples.forEach((s, i) => {
        const last = list.at(-1);
        const opener = last && k.samples[last.first]!;
        if (last && opener!.sdi === s.sdi && (s.dts - opener!.dts) / k.track.timescale < CHUNK_SECONDS) last.count++;
        else list.push({ first: i, count: 1, sdi: s.sdi, time: (s.dts - k.samples[0]!.dts) / k.track.timescale, offset: 0 });
      });
      return list;
    });
    const order = chunks.flatMap((list, t) => list.map((c) => ({ c, t }))).sort((x, y) => x.c.time - y.c.time);

    const raw = (b: Box) => new Uint8Array(view.buffer, view.byteOffset + b.start, b.end - b.start);
    const rest = (parent: Box, skip: string[]) =>
      [...boxes(view, parent.body, parent.end)].filter((b) => !skip.includes(b.type)).map(raw);
    const withDuration = (b: Box, at0: number, at1: number, value: number) => {
      const out = raw(b).slice();
      const v = new DataView(out.buffer);
      const at = b.body - b.start;
      if (out[at] === 1) {
        v.setUint32(at + at1, Math.floor(value / 2 ** 32));
        v.setUint32(at + at1 + 4, value >>> 0);
      } else v.setUint32(at + at0, value);
      return out;
    };
    const moovBytes = () =>
      box(
        "moov",
        withDuration(movie.mvhd, 16, 24, segment),
        ...kept.map(({ track: t, samples, mediaTime }, k) => {
          const stsc: number[] = [];
          chunks[k]!.forEach((c, i) => {
            if (stsc.length && stsc.at(-2) === c.count && stsc.at(-1) === c.sdi) return;
            stsc.push(i + 1, c.count, c.sdi);
          });
          const durations = runsOf(samples.map((s) => s.duration));
          const offsets = runsOf(samples.map((s) => s.cto));
          const syncs = samples.flatMap((s, i) => (s.sync ? [i + 1] : []));
          const stbl = box(
            "stbl",
            ...[...boxes(view, t.stbl.body, t.stbl.end)].filter((b) => b.type === "stsd").map(raw),
            box("stts", words([0, durations.length, ...durations.flat()])),
            ...(t.hasCtts
              ? [box("ctts", words([offsets.some(([, o]) => o < 0) ? 1 << 24 : 0, offsets.length, ...offsets.flat()]))]
              : []),
            ...(t.hasStss ? [box("stss", words([0, syncs.length, ...syncs]))] : []),
            box("stsc", words([0, stsc.length / 3, ...stsc])),
            box("stsz", words([0, 0, samples.length, ...samples.map((s) => s.size)])),
            box("stco", words([0, chunks[k]!.length, ...chunks[k]!.map((c) => c.offset)])),
          );
          const minf = box("minf", ...rest(t.minf, ["stbl"]), stbl);
          const length = samples.reduce((n, s) => n + s.duration, 0);
          const mdia = box("mdia", withDuration(t.mdhd, 16, 24, length), ...rest(t.mdia, ["mdhd", "minf"]), minf);
          const edts = box("edts", box("elst", words([0, 1, segment, mediaTime, 0x00010000])));
          return box("trak", withDuration(t.tkhd, 20, 28, segment), edts, mdia, ...rest(t.trak, ["tkhd", "edts", "mdia", "tref"]));
        }),
        ...rest(movie.moov, ["mvhd", "trak"]),
      );

    const ftyp = movie.top.find((b) => b.type === "ftyp");
    const head = (ftyp ? ftyp.end - ftyp.start : 0) + moovBytes().length + 8;
    let at = head;
    for (const { c, t } of order) {
      c.offset = at;
      for (let i = c.first; i < c.first + c.count; i++) at += kept[t]!.samples[i]!.size;
    }
    if (at >= 2 ** 32) return null;
    const moov = moovBytes();
    const out = new Uint8Array(at);
    let pos = 0;
    if (ftyp) {
      out.set(raw(ftyp), 0);
      pos = ftyp.end - ftyp.start;
    }
    out.set(moov, pos);
    out.set(box("mdat"), pos + moov.length);
    new DataView(out.buffer).setUint32(pos + moov.length, at - head + 8);
    for (const { c, t } of order) {
      let write = c.offset;
      for (let i = c.first; i < c.first + c.count; i++) {
        const s = kept[t]!.samples[i]!;
        out.set(bytes.subarray(s.offset, s.offset + s.size), write);
        write += s.size;
      }
    }
    return out;
  } catch {
    return null;
  }
}

/** How a zoomed photo sits in its box: scale `s`, shifted by x and y from the centre, in pixels. */
export interface ZoomView {
  s: number;
  x: number;
  y: number;
}

export const NO_ZOOM: ZoomView = { s: 1, x: 0, y: 0 };

export const MAX_ZOOM = 4;

/**
 * Scales `was` to `s` so the spot that sat under the point `from` ends up under `to` (both relative to the
 * centre of a w×h box), without letting the photo's edges come inside the box. Pass the same point twice
 * to zoom in place; keep `s` to pan.
 */
export function zoomTo(
  was: ZoomView,
  s: number,
  from: { x: number; y: number },
  to: { x: number; y: number },
  w: number,
  h: number,
): ZoomView {
  const z = clamp(s, 1, MAX_ZOOM);
  const mx = ((z - 1) * w) / 2;
  const my = ((z - 1) * h) / 2;
  return {
    s: z,
    x: clamp(to.x - ((from.x - was.x) * z) / was.s, -mx, mx),
    y: clamp(to.y - ((from.y - was.y) * z) / was.s, -my, my),
  };
}
