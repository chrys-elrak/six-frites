"use client";

import { Camera, RefreshCw, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCamera } from "@/lib/camera";
import { formatDuration } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { Portal } from "./portal";

const TYPES = ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];

/** Full-screen camera that takes a photo, or also films a clip up to `videoMs` long when that is given. */
export function CameraDialog({
  onClose,
  onCapture,
  videoMs,
}: {
  onClose: () => void;
  onCapture: (file: File) => void;
  videoMs?: number;
}) {
  const tr = useT();
  const [mode, setMode] = useState<"photo" | "video">("photo");
  const cam = useCamera("environment", { audio: mode === "video" });
  const recorder = useRef<MediaRecorder | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (startedAt === null) return;
    const t = setInterval(() => {
      setNow(Date.now());
      if (videoMs && Date.now() - startedAt >= videoMs && recorder.current?.state === "recording") recorder.current.stop();
    }, 200);
    return () => clearInterval(t);
  }, [startedAt, videoMs]);

  useEffect(
    () => () => {
      if (recorder.current?.state === "recording") {
        recorder.current.onstop = null;
        recorder.current.stop();
      }
    },
    [],
  );

  function shoot() {
    const v = cam.video.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (cam.facing === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(v, 0, 0);
    canvas.toBlob(
      (blob) =>
        blob &&
        onCapture(new File([blob], `photo-${new Date().toISOString().slice(0, 19)}.jpg`, { type: "image/jpeg" })),
      "image/jpeg",
      0.9,
    );
  }

  function record() {
    if (recorder.current?.state === "recording") return recorder.current.stop();
    if (!cam.stream) return;
    const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(cam.stream, mimeType ? { mimeType, videoBitsPerSecond: 2_500_000 } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      setStartedAt(null);
      recorder.current = null;
      const mime = (rec.mimeType || mimeType || "video/webm").split(";")[0]!;
      const blob = new Blob(chunks, { type: mime });
      if (!blob.size) return;
      const ext = mime.includes("mp4") ? "mp4" : "webm";
      onCapture(new File([blob], `video-${new Date().toISOString().slice(0, 19)}.${ext}`, { type: mime }));
    };
    recorder.current = rec;
    rec.start(250);
    setNow(Date.now());
    setStartedAt(Date.now());
  }

  const recording = startedAt !== null;
  const label = mode === "photo" ? tr.composer.takePhoto : recording ? tr.composer.stopRecording : tr.stories.video;

  return (
    <Portal>
      <div className="fixed inset-0 z-[70] flex flex-col bg-black" role="dialog" aria-modal aria-label={label}>
        <div className="flex items-center justify-between p-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <button
            onClick={onClose}
            aria-label={tr.common.close}
            className="grid size-11 place-items-center rounded-full text-white hover:bg-white/10"
          >
            <X className="size-6" />
          </button>
          {recording && (
            <span className="rounded-full bg-red-600 px-3 py-1 text-sm font-medium tabular-nums text-white">
              {formatDuration(now - (startedAt ?? now))}
              {videoMs ? ` / ${formatDuration(videoMs)}` : ""}
            </span>
          )}
          {cam.canSwitch && !recording ? (
            <button
              onClick={cam.switchCamera}
              aria-label={tr.composer.switchCamera}
              className="grid size-11 place-items-center rounded-full text-white hover:bg-white/10"
            >
              <RefreshCw className="size-5" />
            </button>
          ) : (
            <span className="size-11" />
          )}
        </div>
        <div className="grid min-h-0 flex-1 place-items-center">
          {cam.error ? (
            <p className="max-w-xs text-center text-sm text-white/80">{cam.error}</p>
          ) : (
            <video
              ref={cam.video}
              muted
              playsInline
              className={`max-h-full max-w-full object-contain ${cam.facing === "user" ? "-scale-x-100" : ""}`}
            />
          )}
        </div>
        <div className="grid place-items-center gap-4 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {videoMs && !recording && (
            <div className="flex gap-1 rounded-full bg-white/10 p-1 text-sm text-white">
              {(["photo", "video"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  aria-pressed={mode === m}
                  className={`rounded-full px-4 py-1.5 ${mode === m ? "bg-white text-black" : "hover:bg-white/10"}`}
                >
                  {tr.stories[m]}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={mode === "photo" ? shoot : record}
            disabled={!cam.stream}
            aria-label={label}
            className={`grid size-18 place-items-center rounded-full border-4 border-white text-white transition active:scale-95 disabled:opacity-40 ${
              mode === "video" ? "bg-red-600" : "bg-white/20"
            }`}
          >
            {mode === "photo" ? (
              <Camera className="size-7" />
            ) : recording ? (
              <Square className="size-6 fill-current" />
            ) : null}
          </button>
        </div>
      </div>
    </Portal>
  );
}
