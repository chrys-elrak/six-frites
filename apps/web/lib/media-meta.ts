import type { EncryptedFile, UploadKind } from "@six/shared";

type Meta = Pick<EncryptedFile, "width" | "height" | "durationMs" | "waveform" | "thumb">;

const THUMB_EDGE = 48;
const THUMB_MAX = 20_000;
const BARS = 50;

function thumbOf(source: CanvasImageSource, width: number, height: number) {
  const scale = Math.min(1, THUMB_EDGE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.6, 0.4, 0.2]) {
    const url = canvas.toDataURL("image/jpeg", quality);
    if (url.length <= THUMB_MAX) return url;
  }
  return null;
}

async function imageMeta(blob: Blob): Promise<Meta> {
  const bitmap = await createImageBitmap(blob);
  try {
    return { width: bitmap.width, height: bitmap.height, thumb: thumbOf(bitmap, bitmap.width, bitmap.height) };
  } finally {
    bitmap.close();
  }
}

async function videoMeta(blob: Blob): Promise<Meta> {
  const url = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("Unreadable video"));
      video.src = url;
    });
    const duration = Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : null;
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
      video.currentTime = Math.min(0.5, (duration ?? 0) / 2000);
      setTimeout(resolve, 1500);
    });
    const { videoWidth: width, videoHeight: height } = video;
    return { width, height, durationMs: duration, thumb: width ? thumbOf(video, width, height) : null };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function audioMeta(blob: Blob): Promise<Meta> {
  const ctx = new AudioContext();
  try {
    const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
    const data = audio.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / BARS));
    const peaks = Array.from({ length: Math.min(BARS, data.length) }, (_, i) => {
      let peak = 0;
      for (let j = i * step; j < (i + 1) * step && j < data.length; j++) peak = Math.max(peak, Math.abs(data[j]!));
      return peak;
    });
    const top = Math.max(...peaks, 0.01);
    return {
      durationMs: Math.round(audio.duration * 1000),
      waveform: peaks.map((p) => Math.round((p / top) * 100)),
    };
  } finally {
    void ctx.close();
  }
}

/**
 * Reads what the server used to work out from a file (size, duration, waveform and a tiny preview),
 * for files that get encrypted before upload. Anything unreadable is left out.
 */
export async function mediaMeta(blob: Blob, kind: UploadKind): Promise<Meta> {
  try {
    if (kind === "image") return await imageMeta(blob);
    if (kind === "video" || kind === "video_note") return await videoMeta(blob);
    if (kind === "voice") return await audioMeta(blob);
  } catch {
    return {};
  }
  return {};
}
