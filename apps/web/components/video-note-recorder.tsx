"use client";

import { RefreshCw, SendHorizontal, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { EphemeralInput } from "@six/shared";
import { useCamera } from "@/lib/camera";
import { EphemeralPicker } from "./ephemeral-picker";
import { formatDuration } from "@/lib/format";

const MAX_MS = 60_000;
const TYPES = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/mp4", "video/webm"];

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

export function VideoNoteRecorder({
  initialEphemeral,
  onClose,
  onSend,
}: {
  initialEphemeral: EphemeralInput | null;
  onClose: () => void;
  onSend: (file: File, ephemeral: EphemeralInput | null) => void;
}) {
  const cam = useCamera("user", { audio: true, square: true });
  const [ephemeral, setEphemeral] = useState(initialEphemeral);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const [elapsed, setElapsed] = useState(0);
  const [recording, setRecording] = useState(false);
  const [result, setResult] = useState<{ file: File; url: string } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => {
      const ms = Date.now() - startedAt.current;
      setElapsed(ms);
      if (ms >= MAX_MS) recorder.current?.stop();
    }, 100);
    return () => clearInterval(t);
  }, [recording]);

  useEffect(() => () => (result ? URL.revokeObjectURL(result.url) : undefined), [result]);

  function start() {
    if (!cam.stream) return;
    const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(cam.stream, mimeType ? { mimeType, videoBitsPerSecond: 1_000_000 } : undefined);
    chunks.current = [];
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    rec.onstop = () => {
      setRecording(false);
      const mime = (rec.mimeType || mimeType || "video/webm").split(";")[0]!;
      const blob = new Blob(chunks.current, { type: mime });
      if (Date.now() - startedAt.current < 700 || !blob.size) return;
      const file = new File(
        [blob],
        `video-note-${new Date().toISOString().slice(0, 19)}.${mime.includes("mp4") ? "mp4" : "webm"}`,
        {
          type: mime,
        },
      );
      setResult({ file, url: URL.createObjectURL(blob) });
    };
    recorder.current = rec;
    startedAt.current = Date.now();
    setElapsed(0);
    rec.start(250);
    setRecording(true);
  }

  const mirrored = cam.facing === "user" ? "-scale-x-100" : "";

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center bg-black/90 backdrop-blur"
      role="dialog"
      aria-modal
      aria-label="Record a video message"
    >
      <div className="flex w-full items-center justify-between p-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button
          onClick={onClose}
          aria-label="Close"
          className="grid size-11 place-items-center rounded-full text-white hover:bg-white/10"
        >
          <X className="size-6" />
        </button>
        {cam.canSwitch && !recording && !result && (
          <button
            onClick={cam.switchCamera}
            aria-label="Switch camera"
            className="grid size-11 place-items-center rounded-full text-white hover:bg-white/10"
          >
            <RefreshCw className="size-5" />
          </button>
        )}
      </div>

      <div className="grid flex-1 place-items-center">
        <div className="relative size-[min(78vw,320px)]">
          {(recording || result) && <Ring progress={result ? 1 : Math.min(elapsed / MAX_MS, 1)} />}
          <div className="size-full overflow-hidden rounded-full bg-stone-800">
            {cam.error ? (
              <p className="grid size-full place-items-center p-8 text-center text-sm text-white/80">{cam.error}</p>
            ) : result ? (
              <video src={result.url} autoPlay loop playsInline className={`size-full object-cover ${mirrored}`} />
            ) : (
              <video ref={cam.video} muted playsInline className={`size-full object-cover ${mirrored}`} />
            )}
          </div>
        </div>
        <p className="mt-4 font-mono text-sm text-white tabular-nums">
          {recording ? (
            <span className="inline-flex items-center gap-2">
              <span className="size-2.5 animate-pulse rounded-full bg-red-500" /> {formatDuration(elapsed)} / 1:00
            </span>
          ) : result ? (
            "Preview"
          ) : (
            "Up to 1 minute"
          )}
        </p>
      </div>

      <div className="relative flex items-center gap-8 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <span className="absolute top-1/2 left-[calc(100%+0.5rem)] -translate-y-1/2 text-white">
          <EphemeralPicker value={ephemeral} onChange={setEphemeral} compact />
        </span>
        {result ? (
          <>
            <button
              onClick={() => setResult(null)}
              aria-label="Record again"
              className="grid size-14 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
            >
              <Trash2 className="size-6" />
            </button>
            <button
              onClick={() => onSend(result.file, ephemeral)}
              aria-label="Send video message"
              className="grid size-16 place-items-center rounded-full bg-brand text-brand-ink transition active:scale-95"
            >
              <SendHorizontal className="size-7" />
            </button>
          </>
        ) : (
          <button
            onClick={recording ? () => recorder.current?.stop() : start}
            disabled={!cam.stream}
            aria-label={recording ? "Stop recording" : "Start recording"}
            className="grid size-18 place-items-center rounded-full border-4 border-white transition active:scale-95 disabled:opacity-40"
          >
            <span className={`bg-red-500 transition-all ${recording ? "size-7 rounded-md" : "size-13 rounded-full"}`} />
          </button>
        )}
      </div>
    </div>
  );
}
