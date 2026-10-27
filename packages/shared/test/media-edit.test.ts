import { describe, expect, it } from "vitest";
import { FULL_CROP, cropPixels, dragCrop, stripAudio, turnCrop } from "../src/media-edit.js";

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
