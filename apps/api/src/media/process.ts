import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { Upload } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { downloadObject, headObject, uploadObject } from "../lib/storage.js";
import { finishUpload } from "../services/uploads.js";
import { THUMB, ffmpeg, probe, waveform } from "./ffmpeg.js";

async function store(upload: Upload, dir: string, file: string, name: string, contentType: string) {
  const key = upload.key.replace(/original$/, name);
  await uploadObject(key, join(dir, file), contentType);
  return key;
}

async function image(upload: Upload, dir: string, input: string) {
  const info = await probe(input);
  await ffmpeg(["-i", input, ...THUMB, join(dir, "thumb.webp")]);
  return {
    thumbKey: await store(upload, dir, "thumb.webp", "thumb.webp", "image/webp"),
    width: info.width,
    height: info.height,
  };
}

async function video(upload: Upload, dir: string, input: string) {
  const out = join(dir, "main.mp4");
  await ffmpeg([
    "-i", input,
    "-map", "0:v:0", "-map", "0:a:0?",
    "-vf", "scale='min(1280,iw)':-2,format=yuv420p",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-profile:v", "high",
    "-c:a", "aac", "-b:a", "128k", "-ac", "2",
    "-movflags", "+faststart",
    out,
  ]);
  const info = await probe(out);
  await ffmpeg(["-ss", "0.3", "-i", out, ...THUMB, join(dir, "thumb.webp")]).catch(() =>
    ffmpeg(["-i", out, ...THUMB, join(dir, "thumb.webp")]),
  );
  return {
    mainKey: await store(upload, dir, "main.mp4", "main.mp4", "video/mp4"),
    mainMime: "video/mp4",
    thumbKey: await store(upload, dir, "thumb.webp", "thumb.webp", "image/webp"),
    width: info.width,
    height: info.height,
    durationMs: info.durationMs,
  };
}

const NOTE_SIZE = 384;
const NOTE_MAX_SECONDS = 60;

/** Round video messages: centre square crop, small and short like Telegram's video notes. */
async function videoNote(upload: Upload, dir: string, input: string) {
  const out = join(dir, "main.mp4");
  await ffmpeg([
    "-i", input,
    "-t", String(NOTE_MAX_SECONDS),
    "-map", "0:v:0", "-map", "0:a:0?",
    "-vf", `crop='min(iw,ih)':'min(iw,ih)',scale=${NOTE_SIZE}:${NOTE_SIZE},format=yuv420p`,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "28",
    "-c:a", "aac", "-b:a", "64k", "-ac", "1",
    "-movflags", "+faststart",
    out,
  ]);
  const info = await probe(out);
  await ffmpeg(["-i", out, ...THUMB, join(dir, "thumb.webp")]);
  return {
    mainKey: await store(upload, dir, "main.mp4", "main.mp4", "video/mp4"),
    mainMime: "video/mp4",
    thumbKey: await store(upload, dir, "thumb.webp", "thumb.webp", "image/webp"),
    width: NOTE_SIZE,
    height: NOTE_SIZE,
    durationMs: info.durationMs,
  };
}

async function voice(upload: Upload, dir: string, input: string) {
  const out = join(dir, "main.m4a");
  await ffmpeg(["-i", input, "-vn", "-c:a", "aac", "-b:a", "64k", "-ac", "1", "-movflags", "+faststart", out]);
  const info = await probe(out);
  return {
    mainKey: await store(upload, dir, "main.m4a", "main.m4a", "audio/mp4"),
    mainMime: "audio/mp4",
    durationMs: info.durationMs,
    waveform: await waveform(out),
  };
}

const STICKER_SIZE = 512;
const LOTTIE_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Stickers: images become a WebP of at most 512px; Lottie (.tgs is gzipped) becomes plain JSON,
 * without image assets that point outside the file, so a sticker can't load a tracking pixel.
 */
async function sticker(upload: Upload, dir: string, input: string) {
  if (upload.mime.startsWith("image/")) {
    const fit = `scale='min(${STICKER_SIZE},iw)':'min(${STICKER_SIZE},ih)':force_original_aspect_ratio=decrease`;
    await ffmpeg(["-i", input, "-frames:v", "1", "-vf", fit, "-c:v", "libwebp", "-quality", "90", join(dir, "main.webp")]);
    const info = await probe(join(dir, "main.webp"));
    return {
      mainKey: await store(upload, dir, "main.webp", "main.webp", "image/webp"),
      mainMime: "image/webp",
      width: info.width,
      height: info.height,
    };
  }

  const raw = await readFile(input);
  const gzipped = raw[0] === 0x1f && raw[1] === 0x8b;
  const text = (gzipped ? gunzipSync(raw, { maxOutputLength: LOTTIE_MAX_BYTES }) : raw).toString();
  let lottie: { w?: unknown; h?: unknown; layers?: unknown; assets?: { p?: unknown }[] };
  try {
    lottie = JSON.parse(text);
  } catch {
    throw new Error("Not a Lottie animation");
  }
  if (!Array.isArray(lottie.layers) || typeof lottie.w !== "number" || typeof lottie.h !== "number") {
    throw new Error("Not a Lottie animation");
  }
  lottie.assets = (lottie.assets ?? []).filter((a) => typeof a.p !== "string" || a.p.startsWith("data:"));
  await writeFile(join(dir, "main.json"), JSON.stringify(lottie));
  return {
    mainKey: await store(upload, dir, "main.json", "main.json", "application/json"),
    mainMime: "application/json",
    width: Math.round(lottie.w),
    height: Math.round(lottie.h),
  };
}

/** Converts an uploaded file into formats every platform can display, then marks it ready. */
export async function processUpload(uploadId: string) {
  const upload = await prisma.upload.findUnique({ where: { id: uploadId } });
  if (!upload || upload.status !== "processing") return;

  const dir = await mkdtemp(join(tmpdir(), "six-media-"));
  try {
    const input = join(dir, "original");
    await downloadObject(upload.key, input);
    if ((await stat(input)).size === 0) throw new Error("Empty file");

    const result =
      upload.kind === "image"
        ? await image(upload, dir, input)
        : upload.kind === "video"
          ? await video(upload, dir, input)
          : upload.kind === "video_note"
            ? await videoNote(upload, dir, input)
            : upload.kind === "voice"
              ? await voice(upload, dir, input)
              : upload.kind === "sticker"
                ? await sticker(upload, dir, input)
                : {};
    const { mainKey, thumbKey } = result as { mainKey?: string; thumbKey?: string };
    const sizes = await Promise.all([mainKey, thumbKey].filter((k): k is string => !!k).map(headObject));
    const storedBytes = upload.size + sizes.reduce((n, h) => n + (h?.size ?? 0), 0);
    await finishUpload(uploadId, { ...result, storedBytes, status: "ready", error: null });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
