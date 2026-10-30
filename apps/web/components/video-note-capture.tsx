"use client";

import { EyeOff, RefreshCw, Square, Volume2, VolumeX } from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useCamera } from "@/lib/camera";
import { formatDuration } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { withVoiceEffect } from "@/lib/voice-fx";
import { pill } from "./attach-dialog";

const MAX_MS = 60_000;
const SIZE = 480;
const TYPES = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/mp4", "video/webm"];

export interface VideoNoteHandle {
  /** Stops and returns the clip, or null when it was too short or never started. */
  stop: () => Promise<File | null>;
  cancel: () => void;
}

interface NoteOptionsProps {
  muted: boolean;
  spoiler: boolean;
  onToggleMute: () => void;
  onToggleSpoiler: () => void;
}

function NoteOptions({ muted, spoiler, onToggleMute, onToggleSpoiler }: NoteOptionsProps) {
  const tr = useT();
  return (
    <div className="pointer-events-auto flex gap-2">
      <button
        type="button"
        onClick={onToggleSpoiler}
        aria-pressed={spoiler}
        title={spoiler ? tr.composer.showNormally : tr.composer.hideWithSpoiler}
        className={pill(spoiler)}
      >
        <EyeOff className="size-3.5" />
        {spoiler ? tr.composer.spoilerOn : tr.summary.spoiler}
      </button>
      <button
        type="button"
        onClick={onToggleMute}
        aria-pressed={muted}
        title={muted ? tr.composer.unmute : tr.composer.mute}
        className={pill(muted)}
      >
        {muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
        {muted ? tr.composer.muted : tr.composer.mute}
      </button>
    </div>
  );
}

function Ring({ progress }: { progress: number }) {
  const r = 49;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 100 100" className="pointer-events-none absolute -inset-2 -rotate-90" aria-hidden>
      <circle cx="50" cy="50" r={r} fill="none" stroke="rgb(255 255 255 / 0.15)" strokeWidth="1.2" />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke="var(--color-brand)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - progress)}
      />
    </svg>
  );
}

/**
 * Records a round video message above the composer. Frames go through a canvas, so switching between
 * the front and back camera mid-recording keeps the same recording. `bottom` keeps the composer uncovered.
 * Spoiler and mute are only choices here; the composer applies them to the finished clip.
 */
export const VideoNoteCapture = forwardRef<
  VideoNoteHandle,
  NoteOptionsProps & { bottom: number; onTick: (ms: number) => void; onLimit: () => void; onStop: () => void }
>(function VideoNoteCapture({ bottom, onTick, onLimit, onStop, ...options }, ref) {
  const tr = useT();
  const cam = useCamera("user", { square: true });
  const [audio, setAudio] = useState<MediaStream | null>(null);
  const [micError, setMicError] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const done = useRef<((file: File | null) => void) | null>(null);
  const handlers = useRef({ onTick, onLimit });
  handlers.current = { onTick, onLimit };

  useEffect(() => {
    let release: (() => void) | null = null;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(withVoiceEffect)
      .then((fx) => {
        if (cancelled) return fx.stop();
        release = fx.stop;
        setAudio(fx.stream);
      })
      .catch(() => setMicError(true));
    return () => {
      cancelled = true;
      release?.();
    };
  }, []);

  useEffect(() => {
    const c = Object.assign(document.createElement("canvas"), {
      width: SIZE,
      height: SIZE,
    });
    canvas.current = c;
    const ctx = c.getContext("2d")!;
    let frame = 0;
    const draw = () => {
      const v = cam.video.current;
      if (v && v.readyState >= 2 && v.videoWidth) {
        const side = Math.min(v.videoWidth, v.videoHeight);
        ctx.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, SIZE, SIZE);
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [cam.video]);

  useEffect(() => {
    if (!cam.stream || !audio || recorder.current || !canvas.current) return;
    const tracks = [...canvas.current.captureStream(30).getVideoTracks(), ...audio.getAudioTracks()];
    const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(
      new MediaStream(tracks),
      mimeType ? { mimeType, videoBitsPerSecond: 1_000_000 } : undefined,
    );
    chunks.current = [];
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    rec.onstop = () => {
      const mime = (rec.mimeType || mimeType || "video/webm").split(";")[0]!;
      const blob = new Blob(chunks.current, { type: mime });
      const name = `video-note-${new Date().toISOString().slice(0, 19)}.${mime.includes("mp4") ? "mp4" : "webm"}`;
      done.current?.(
        Date.now() - startedAt.current < 700 || !blob.size ? null : new File([blob], name, { type: mime }),
      );
      done.current = null;
    };
    recorder.current = rec;
    startedAt.current = Date.now();
    rec.start(250);
  }, [cam.stream, audio]);

  useEffect(() => {
    let limited = false;
    const t = setInterval(() => {
      if (recorder.current?.state !== "recording") return;
      const ms = Date.now() - startedAt.current;
      setElapsed(ms);
      handlers.current.onTick(ms);
      if (ms >= MAX_MS && !limited) {
        limited = true;
        handlers.current.onLimit();
      }
    }, 100);
    return () => clearInterval(t);
  }, []);

  useEffect(
    () => () => {
      if (recorder.current?.state !== "recording") return;
      done.current = null;
      recorder.current.stop();
    },
    [],
  );

  useImperativeHandle(
    ref,
    () => ({
      stop: () =>
        new Promise((resolve) => {
          const rec = recorder.current;
          if (!rec || rec.state === "inactive") return resolve(null);
          done.current = resolve;
          rec.stop();
        }),
      cancel: () => {
        done.current = null;
        if (recorder.current?.state === "recording") recorder.current.stop();
      },
    }),
    [],
  );

  const error = cam.error ?? (micError ? tr.composer.cameraMicDenied : null);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-40 flex flex-col items-center justify-center gap-4 bg-black/45 backdrop-blur-sm"
      style={{ bottom }}
    >
      <div className="relative size-[min(70vw,300px)]">
        <Ring progress={Math.min(elapsed / MAX_MS, 1)} />
        <div className="size-full overflow-hidden rounded-full bg-stone-800">
          {error ? (
            <p className="grid size-full place-items-center p-8 text-center text-sm text-white/80">{error}</p>
          ) : (
            <video
              ref={cam.video}
              muted
              playsInline
              className={`size-full object-cover ${cam.facing === "user" ? "-scale-x-100" : ""}`}
            />
          )}
        </div>
      </div>
      <p className="font-mono text-sm text-white tabular-nums">{formatDuration(elapsed)} / 1:00</p>
      <NoteOptions {...options} />
      <div className="pointer-events-auto flex items-center gap-4">
        {cam.canSwitch && (
          <button
            type="button"
            onClick={cam.switchCamera}
            aria-label={tr.composer.switchCamera}
            className="grid size-12 place-items-center rounded-full bg-black/50 text-white hover:bg-black/70"
          >
            <RefreshCw className="size-5" />
          </button>
        )}
        <button
          type="button"
          onClick={onStop}
          aria-label={tr.composer.stopRecording}
          title={tr.composer.stopRecording}
          className="grid size-12 place-items-center rounded-full bg-red-600 text-white hover:bg-red-700"
        >
          <Square className="size-5 fill-current" />
        </button>
      </div>
    </div>
  );
});

/** Plays a recorded video message in its circle, on a loop, until it is sent or thrown away. Tap to pause. */
export function VideoNotePreview({
  url,
  bottom,
  ...options
}: NoteOptionsProps & {
  url: string;
  bottom: number;
}) {
  const tr = useT();
  const video = useRef<HTMLVideoElement>(null);
  return (
    <div
      className="fixed inset-x-0 top-0 z-40 flex flex-col items-center justify-center bg-black/45 backdrop-blur-sm"
      style={{ bottom }}
    >
      <button
        type="button"
        aria-label={tr.composer.playPreview}
        onClick={() => {
          const v = video.current;
          if (!v) return;
          if (v.paused) void v.play();
          else v.pause();
        }}
        className="relative size-[min(70vw,300px)]"
      >
        <Ring progress={1} />
        <span className="block size-full overflow-hidden rounded-full bg-stone-800">
          <video
            ref={video}
            src={url}
            autoPlay
            loop
            playsInline
            muted={options.muted}
            className={`size-full object-cover transition duration-300 ${options.spoiler ? "scale-110 blur-xl brightness-75" : ""}`}
          />
        </span>
      </button>
      <div className="mt-4">
        <NoteOptions {...options} />
      </div>
    </div>
  );
}
