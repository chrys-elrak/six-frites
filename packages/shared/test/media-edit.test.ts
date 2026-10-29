import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  FULL_CROP,
  NO_EDIT,
  type PhotoEdit,
  cropPixels,
  dragCrop,
  flipEdit,
  isEdited,
  labelAt,
  scaleLabel,
  cutStart,
  stripAudio,
  trimVideo,
  turnCrop,
  turnEdit,
  MAX_ZOOM,
  NO_ZOOM,
  videoCuts,
  zoomTo,
} from "../src/media-edit.js";

const u32 = (n: number) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const box = (type: string, ...parts: number[][]) => {
  const body = parts.flat();
  return [...u32(body.length + 8), ...ascii(type), ...body];
};
const full = (type: string, ...parts: number[][]) => box(type, [0, 0, 0, 0], ...parts);

/** One track whose samples sit at the given offsets, two 3-byte samples per chunk. */
const trak = (handler: string, chunks: number[]) =>
  box(
    "trak",
    box(
      "mdia",
      full("hdlr", u32(0), ascii(handler), u32(0), u32(0), u32(0), [0]),
      box(
        "minf",
        box(
          "stbl",
          full("stsc", u32(1), u32(1), u32(2), u32(1)),
          full("stsz", u32(3), u32(chunks.length * 2)),
          full("stco", u32(chunks.length), ...chunks.map(u32)),
        ),
      ),
    ),
  );

function movie(moov: (mdatStart: number) => number[]) {
  const ftyp = box("ftyp", ascii("isom"), u32(0));
  const data = ascii("VVVVVVAAAAAAVVVVVVAAAAAA");
  const start = ftyp.length + 8;
  return new Uint8Array([...ftyp, ...box("mdat", data), ...moov(start)]);
}

describe("stripAudio", () => {
  it("zeroes the sound samples and hides the sound track, leaving the video alone", () => {
    const file = movie((at) => box("moov", trak("vide", [at, at + 12]), trak("soun", [at + 6, at + 18])));
    const before = file.length;
    expect(stripAudio(file)).toBe(true);
    const text = String.fromCharCode(...file);
    expect(file.length).toBe(before);
    expect(text).not.toContain("A");
    expect(text.match(/V/g)).toHaveLength(12);
    expect(text.match(/trak/g)).toHaveLength(1);
    expect(text).toContain("vide");
  });

  it("refuses files it can't safely edit", () => {
    expect(stripAudio(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]))).toBe(false);
    const fragmented = movie((at) => box("moov", box("mvex"), trak("soun", [at + 6])));
    expect(stripAudio(fragmented)).toBe(false);
    expect(String.fromCharCode(...fragmented)).toContain("AAAAAA");
  });

  it("calls a silent video already muted", () => {
    expect(stripAudio(movie((at) => box("moov", trak("vide", [at]))))).toBe(true);
  });
});

describe("crop", () => {
  it("keeps the box inside the photo and above the minimum size", () => {
    expect(dragCrop(FULL_CROP, "move", 0.3, 0.3)).toEqual(FULL_CROP);
    expect(dragCrop(FULL_CROP, "nw", 0.25, 0.5)).toEqual({ x: 0.25, y: 0.5, w: 0.75, h: 0.5 });
    const tiny = dragCrop(FULL_CROP, "se", -2, -2);
    expect(tiny.w).toBeCloseTo(0.08);
    expect(tiny.h).toBeCloseTo(0.08);
  });

  it("follows the photo through four quarter turns", () => {
    const c = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };
    const near = (a: typeof c, b: typeof c) => (["x", "y", "w", "h"] as const).forEach((k) => expect(a[k]).toBeCloseTo(b[k]));
    near(turnCrop(c), { x: 0.2, y: 0.6, w: 0.4, h: 0.3 });
    near(turnCrop(turnCrop(turnCrop(turnCrop(c)))), c);
  });

  it("turns into whole pixels inside the image", () => {
    expect(cropPixels({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 }, 101, 99)).toEqual({ originX: 51, originY: 50, width: 50, height: 49 });
  });
});

/** Where a point of the original photo ends up once it is turned and mirrored as `e` says. */
function orient(e: PhotoEdit, [x, y]: [number, number]): [number, number] {
  for (let i = 0; i < e.turns; i++) [x, y] = [y, 1 - x];
  return e.flipped ? [1 - x, y] : [x, y];
}

describe("photo edits", () => {
  const drawn: PhotoEdit = {
    ...NO_EDIT,
    strokes: [{ color: "#fff", size: 0.01, points: [0.1, 0.2, 0.3, 0.4] }],
    labels: [{ text: "hi", x: 0.25, y: 0.75, size: 0.05, color: "#fff" }],
  };

  it("turns and flips the photo the same way as what is drawn on it", () => {
    let e = drawn;
    for (const step of [turnEdit, flipEdit, turnEdit, turnEdit, flipEdit, turnEdit, flipEdit]) {
      const next = step(e);
      const p: [number, number] = [0.15, 0.6];
      const moved = step({ ...NO_EDIT, labels: [{ ...drawn.labels[0]!, x: orient(e, p)[0], y: orient(e, p)[1] }] }).labels[0]!;
      orient(next, p).forEach((v, i) => expect(v).toBeCloseTo(i ? moved.y : moved.x));
      e = next;
    }
  });

  it("comes back to the start after four turns or two flips", () => {
    for (const round of [turnEdit(turnEdit(turnEdit(turnEdit(drawn)))), flipEdit(flipEdit(drawn))]) {
      expect(round).toMatchObject({ turns: 0, flipped: false });
      round.strokes[0]!.points.forEach((v, i) => expect(v).toBeCloseTo(drawn.strokes[0]!.points[i]!));
    }
    expect(isEdited(turnEdit(turnEdit(turnEdit(turnEdit(NO_EDIT)))))).toBe(false);
    expect(isEdited(drawn)).toBe(true);
  });

  it("finds the label under a point", () => {
    expect(labelAt(drawn.labels, 0.25, 0.75, 1000, 1000)).toBe(0);
    expect(labelAt(drawn.labels, 0.6, 0.75, 1000, 1000)).toBe(-1);
    expect(labelAt([scaleLabel(drawn.labels[0]!, 3)], 0.37, 0.75, 1000, 1000)).toBe(0);
  });

  it("keeps resized labels within reason", () => {
    expect(scaleLabel(drawn.labels[0]!, 0.01).size).toBe(0.015);
    expect(scaleLabel(drawn.labels[0]!, 100).size).toBe(0.6);
  });
});

describe("zoomTo", () => {
  it("keeps the pinched spot under the fingers and the photo inside its box", () => {
    const at = { x: 50, y: -20 };
    const z = zoomTo(NO_ZOOM, 2, at, at, 400, 300);
    expect(z).toEqual({ s: 2, x: -50, y: 20 });
    expect((at.x - z.x) / z.s).toBe(at.x);
    expect(zoomTo(z, 2, at, { x: 1000, y: 20 }, 400, 300)).toEqual({ s: 2, x: 200, y: 60 });
    expect(zoomTo(z, 9, at, at, 400, 300).s).toBe(MAX_ZOOM);
    expect(zoomTo(z, 0.5, at, at, 400, 300)).toEqual({ s: 1, x: 0, y: 0 });
  });
});

describe("trimVideo", () => {
  const clip = new Uint8Array(readFileSync(new URL("./fixtures/clip.mp4", import.meta.url)));
  const seconds = (xs: number[]) => xs.map((x) => Math.round(x * 1000) / 1000);

  it("lists where a cut can start: the keyframes", () => {
    const cuts = videoCuts(clip)!;
    expect(cuts.duration).toBeCloseTo(4, 1);
    expect(seconds(cuts.keyframes)).toEqual([0, 1, 2, 3]);
    expect(cutStart(cuts.keyframes, 1.7)).toBe(1);
  });

  it("keeps what shows from the keyframe to the end, starting at 0", () => {
    const out = trimVideo(clip, 1.5, 3.2)!;
    const cuts = videoCuts(out)!;
    expect(cuts.duration).toBeCloseTo(2.2, 2);
    expect(seconds(cuts.keyframes)).toEqual([0, 1, 2]);
    expect(out.length).toBeLessThan(clip.length * 0.75);
  });

  it("refuses cuts too short to keep and files it can't read", () => {
    expect(trimVideo(clip, 3, 3.05)).toBeNull();
    expect(trimVideo(new Uint8Array(16), 0, 1)).toBeNull();
    expect(videoCuts(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]))).toBeNull();
  });
});
