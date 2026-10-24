import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const MAX_BUFFER = 64 * 1024 * 1024;

export async function ffmpeg(args: string[]) {
  await exec("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { maxBuffer: MAX_BUFFER });
}

export interface Probe {
  width: number | null;
  height: number | null;
  durationMs: number | null;
  hasVideo: boolean;
  hasAudio: boolean;
}

export async function probe(file: string): Promise<Probe> {
  const { stdout } = await exec(
    "ffprobe",
    ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file],
    { maxBuffer: MAX_BUFFER },
  );
  const info = JSON.parse(stdout) as {
    streams?: { codec_type?: string; width?: number; height?: number; tags?: { rotate?: string }; side_data_list?: { rotation?: number }[] }[];
    format?: { duration?: string };
  };
  const video = info.streams?.find((s) => s.codec_type === "video");
  const rotation = Math.abs(Number(video?.tags?.rotate ?? video?.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? 0));
  const sideways = rotation === 90 || rotation === 270;
  const duration = Number(info.format?.duration);
  return {
    width: (sideways ? video?.height : video?.width) ?? null,
    height: (sideways ? video?.width : video?.height) ?? null,
    durationMs: Number.isFinite(duration) && duration > 0 ? Math.round(duration * 1000) : null,
    hasVideo: !!video,
    hasAudio: !!info.streams?.some((s) => s.codec_type === "audio"),
  };
}

/** Peak levels of the audio as `bars` integers from 0 to 100, for drawing a voice-note waveform. */
export async function waveform(file: string, bars = 64): Promise<number[]> {
  const { stdout } = await exec(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-i", file, "-ac", "1", "-ar", "8000", "-f", "s16le", "-acodec", "pcm_s16le", "pipe:1"],
    { encoding: "buffer", maxBuffer: MAX_BUFFER },
  );
  const samples = new Int16Array(stdout.buffer, stdout.byteOffset, Math.floor(stdout.byteLength / 2));
  if (!samples.length) return Array(bars).fill(0);
  const size = Math.max(1, Math.floor(samples.length / bars));
  const peaks = Array.from({ length: bars }, (_, i) => {
    let peak = 0;
    for (let j = i * size; j < Math.min((i + 1) * size, samples.length); j++) peak = Math.max(peak, Math.abs(samples[j]!));
    return peak;
  });
  const max = Math.max(...peaks, 1);
  return peaks.map((p) => Math.round((p / max) * 100));
}
